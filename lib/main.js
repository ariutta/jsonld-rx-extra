var _ = require('lodash');
var assert = require('assert');
var jsonld = require('jsonld');
var getInitialContext = require('./get-initial-context.js');

var LRU = require('lru-cache');
var Matcher = require('./matcher.js');
var Rx = global.Rx = global.Rx || require('rx-extra');
//require('rx-extra/lib/to-node-callback.js')(Rx);
var utils = require('./utils.js');

// from jsonld-rx
var jsonldRxPlain = function() {
  /*
  // properties to delete because they aren't needed in this library
  [
    'Promise',
    'promises',
    'Promisify'
  ].forEach(function(methodName) {
    delete jsonld[methodName];
  });
  //*/

  var jsonldAsyncMethodNames = [
    'compact',
    // TODO probably supposed to use documentLoader, but
    // that only responds to promises, not callbacks.
    'loadDocument',
    'expand',
    'flatten',
    'frame',
    'fromRDF',
    'normalize',
    'processContext',
    'toRDF'
  ];

  var jsonldMethodNames = _.keys(jsonld).filter(function(methodName) {
    return typeof jsonld[methodName] === 'function';
  });

  var jsonldRx = jsonldMethodNames.reduce(function(acc, methodName) {
    var method = jsonld[methodName];
    if (jsonldAsyncMethodNames.indexOf(methodName) > -1) {
      acc[methodName] = Rx.Observable.fromNodeCallback(method);
    } else {
      acc[methodName] = method;
    }
    return acc;
  }, {});

  var cacheOptions = {
    max: 500,
    length: function(n) {
      return n * 2;
    },
    dispose: function(key, n) {
      n.close();
    },
    maxAge: 1000 * 60 * 60
  };
  var cache = jsonldRx._cache = LRU(cacheOptions);

  return jsonldRx;
};

//TODO normalize first
//var preferredContextHash = jsonld.sha1.hash(JSON.stringify(preferredContext));

var JsonldRx = function(options) {
  options = options || {};
  var transformerContextOption = options.transformerContext;
  delete options.transformerContext;
  var jsonldRx = jsonldRxPlain(options);

  /**
   * dereferenceContext
   *
   * @param {String|String[]|Object|Object[]} inputContext
   * @return {Object} output same as input, except any contexts
   *    referenced as IRIs (external contexts) are dereferenced
   */
  function dereferenceContext(inputContext) {
    if (!inputContext) {
      throw new Error('No context provided in jsonldRx.dereferenceContext');
    }
    assert.ok(_.isString(inputContext) || _.isPlainObject(inputContext) || _.isArray(inputContext), 'inputContext for dereferenceContext should be String|String[]|Object|Object[]');

    return jsonldRx.processContext(getInitialContext(), inputContext)
    .doOnNext(function(dereferencedContext) {
      assert(_.isPlainObject(dereferencedContext), 'Output from jsonldRx.processContext in dereferenceContext should be a plain object');
      assert(dereferencedContext.hasOwnProperty('@base'), 'dereferencedContext from jsonldRx.processContext in dereferenceContext should have a "@base" property');
    })
    .map(function(context) {
      var seed = {};
      var base = context['@base'].href;
      if (base !== '') {
        seed['@base'] = base;
      }
      return _.reduce(_.toPairs(context.mappings), function(acc, pair) {
        var key = pair[0];
        var value = pair[1];
        if (_.isString(value)) {
          acc[key] = value;
        } else if (_.isPlainObject(value) && !!value['@id']) {
          acc[key] = value;
        }
        // TODO what about colon keys?
        return acc;
      }, seed);
    })
    .doOnNext(function(dereferencedContext) {
      assert(_.isPlainObject(dereferencedContext), 'Output from dereferenceContext should be a plain object');
      assert(_.values(dereferencedContext).length > 0, 'Output from dereferenceContext should have at least one property');
      assert(!dereferencedContext.keepFreeFloatingNodes, 'Output from dereferenceContext should not have a "keepFreeFloatingNodes" property');
      assert(!dereferencedContext.documentLoader, 'Output from dereferenceContext should not have a "documentLoader" property');
      assert(!dereferencedContext.keepFreeFloatingNodes, 'Output from dereferenceContext should not have a "keepFreeFloatingNodes" property');
    });
  }

  var latestTransformerContext$ = new Rx.ReplaySubject(1);

  dereferenceContext(transformerContextOption || {
    '@vocab': 'http://example.org/no-transformer-context-specified'
  })
  .subscribe(function(transformerContext) {
    assert(_.isPlainObject(transformerContext), 'initial transformerContext should be a plain object');
    assert(!transformerContext.documentLoader, 'initial transformerContext should not have property documentLoader');
    assert(!transformerContext.keepFreeFloatingNodes, 'initial transformerContext should not have property keepFreeFloatingNodes');
    latestTransformerContext$.onNext(transformerContext);
  }, function(err) {
    latestTransformerContext$.onError(err);
  });

  jsonldRx.transformerContext = function(context) {
    if (_.isEmpty(context)) {
      return latestTransformerContext$.first()
      // TODO it's bizarre that the following two steps are needed
      .map(function(latestTransformerContext) {
        return JSON.parse(JSON.stringify(latestTransformerContext));
      })
      .map(function(latestTransformerContext) {
        if (latestTransformerContext['@base'] === '') {
          delete latestTransformerContext['@base'];
        }
        if (latestTransformerContext.base === '') {
          delete latestTransformerContext.base;
        }
        delete latestTransformerContext.keepFreeFloatingNodes;
        return latestTransformerContext;
      })
      .doOnNext(function(latestTransformerContext) {
        assert(_.isPlainObject(latestTransformerContext), 'latestTransformerContext from jsonldRx.transformerContext() should be a plain object (context empty)');
        assert(!_.isEmpty(latestTransformerContext), 'latestTransformerContext from jsonldRx.transformerContext() should not be empty (context empty)');
        assert(!latestTransformerContext.documentLoader, 'latestTransformerContext jsonldRx.transformerContext() should not have property documentLoader (context empty)');
        assert(!latestTransformerContext.keepFreeFloatingNodes, 'latestTransformerContext jsonldRx.transformerContext() should not have property keepFreeFloatingNodes (context empty)');
      });
    }

    return Rx.Observable.forkJoin(
        dereferenceContext(context)
        .doOnError(function(err) {
          throw err;
        }),
        latestTransformerContext$
        .first()
        .doOnError(function(err) {
          throw err;
        })
    )
    .map(function(result) {
      assert.ok(_.isArray(result), 'transformerContext forkJoin result should be an array');

      var dereferencedContext = result[0];
      assert.ok(_.isPlainObject(dereferencedContext), 'dereferencedContext from jsonldRx.transformerContext() should be a plain object');
      assert.ok(!_.isEmpty(dereferencedContext), 'dereferencedContext from jsonldRx.transformerContext() should not be empty');
      assert(!dereferencedContext.documentLoader, 'dereferencedContext should jsonldRx.transformerContext() not have property documentLoader');
      assert(!dereferencedContext.keepFreeFloatingNodes, 'dereferencedContext jsonldRx.transformerContext() should not have property keepFreeFloatingNodes');

      var latestTransformerContext = result[1];
      assert.ok(_.isPlainObject(latestTransformerContext), 'latestTransformerContext from jsonldRx.transformerContext() should be a plain object (context not empty)');
      assert.ok(!_.isEmpty(latestTransformerContext), 'latestTransformerContext from jsonldRx.transformerContext() should not be empty (context not empty)');
      assert(!latestTransformerContext.documentLoader, 'latestTransformerContext jsonldRx.transformerContext() should not have property documentLoader (context not empty)');
      assert(!latestTransformerContext.keepFreeFloatingNodes, 'latestTransformerContext jsonldRx.transformerContext() should not have property keepFreeFloatingNodes (context not empty)');

      return jsonldRx.mergeContexts(
          utils.arrayifyClean(dereferencedContext)
          .concat(utils.arrayifyClean(latestTransformerContext))
      );
    })
    .doOnNext(function(context) {
      assert.ok(_.isPlainObject(context), 'final transformerContext from jsonldRx.transformerContext() should be a plain object');
      assert.ok(!_.isEmpty(context), 'final transformerContext from jsonldRx.transformerContext() should not be empty');
      latestTransformerContext$.onNext(context);
    });
  };

//  /**
//   * addContext: ensure every term in the input has an IRI
//   *
//   * @param {String} defaultVocab
//   * @param {Object} inputDoc
//   * @returns {Observable}
//   */
//  jsonldRx.addContext = function(inputDoc) {
//    var timeout = 3 * 1000;
//    // transformerContext is the context internal to this instance of JsonldRx
//    var transformerContext = _.isArray(transformerContext) ? transformerContext : [transformerContext];
//    var unionContext = transformerContext.concat(utils.arrayifyClean(inputDoc['@context']));
//
//    return dereferenceContext(unionContext)
//    .map(function(mergedContexts) {
//      // this looks awkward, but it is needed in order to put the @context property first
//      var outputDoc = {
//        '@context': mergedContexts
//      };
//      _.defaults(outputDoc, inputDoc);
//      // TODO why do we need to stringify it here and parse it in the next step?
//      return JSON.stringify(outputDoc);
//    })
//    .map(function(value) {
//      var parsedValue = JSON.parse(value);
//      return parsedValue;
//    })
//    .doOnError(function(err, push) {
//      err.message = (err.message || '') +
//        ' observed in jsonldRxExtra addContext';
//      throw err;
//    })
//    .timeout(
//        timeout,
//        Rx.Observable.throw(new Error('jsonldRx.addContext timed out.'))
//    );
//  };

//  function fillMissingContext(input, transformerContext) {
//    transformerContext = transformerContext || jsonldRx.transformerContext;
//    if (_.isPlainObject(input)) {
//      input['@context'] = input['@context'] || transformerContext;
//    } else if (_.isArray(input)) {
//      input = input.map(function(subDoc) {
//        subDoc['@context'] = subDoc['@context'] || transformerContext;
//        return subDoc;
//      });
//    }
//    return input;
//  }

  /**
   * embedContexts dereference any provided @context(s)
   *
   * @param {Object} input
   * @param {String|String[]|Object|Object[]} [input['@context']] the
   *    document's context or docContext
   * @return {Object} output same as input, except any contexts referenced
   *    as IRIs (external contexts) are dereferenced (embedded)
   */
  // TODO this doesn't handle in-line contexts within the body of the document
  function embedContexts(doc) {
    var docContext = doc['@context'];
    if (!docContext) {
      return Rx.Observable.return(docContext);
    }

    return dereferenceContext(docContext)
    .map(function(embeddedDocContext) {
      assert(!embeddedDocContext.documentLoader, 'embeddedDocContext from embedContexts should not have a "documentLoader" property');
      assert(!embeddedDocContext.keepFreeFloatingNodes, 'embeddedDocContext from embedContexts should not have a "keepFreeFloatingNodes" property');
      doc['@context'] = embeddedDocContext;
      return doc;
    });
  }

  function getValueIdsAndKeysFromContext(context) {
    assert(!context.documentLoader, 'context for getValueIdsAndKeysFromContext should not have a "documentLoader" property');
    assert(!context.keepFreeFloatingNodes, 'context for getValueIdsAndKeysFromContext should not have a "keepFreeFloatingNodes" property');
    return _.toPairs(context).reduce(function(acc, pair) {
      var key = pair[0];
      var value = pair[1];
      var valueId;
      if (_.isString(value)) {
        valueId = value;
      } else if (value['@id']) {
        valueId = value['@id'];
//      } else if (value['@reverse']) {
//        return;
      } else {
        console.warn(value);
        throw new Error('Cannot handle this context value.');
      }
      if (context.hasOwnProperty(key) && (valueId)) {
        acc[valueId] = key;
      }
      assert(!acc.documentLoader, 'acc for getValueIdsAndKeysFromContext should not have a "documentLoader" property');
      assert(!acc.keepFreeFloatingNodes, 'acc for getValueIdsAndKeysFromContext should not have a "keepFreeFloatingNodes" property');
      return acc;
    }, {});
  }

  jsonldRx.defaultNormalize = function(input, options) {
    //fillMissingContext(input);
    options = options || {};
    var defaultOptions = {format: 'application/nquads'};
    _.defaults(options, defaultOptions);
    return jsonldRx.normalize(input, options)
    .concatMap(function(result) {
      if (result) {
        return Rx.Observable.return(result);
      } else {
        var defaultString = 'jsonld-rx-extra-default-string';
        var keys = _.keys(input);
        var valueKeys = keys.filter(function(key) {
          // TODO
          return key !== '@context';
        });
        // to make sure we return something, even if there's just
        // an @id and maybe a @context.
        if (valueKeys.length < 2) {
          var placeholderKey = 'http://example.org/' + defaultString + '-value';
          input[placeholderKey] = input[placeholderKey] ||
              defaultString;
        }
        return jsonldRx.expand(input, {keepFreeFloatingNodes: true})
        .concatMap(function(expanded) {
          if (_.isArray(expanded)) {
            if (expanded.length === 1) {
              expanded = expanded[0];
            } else {
              console.error('input');
              console.error(input);
              console.error('expanded');
              console.error(expanded);
              throw new Error('Got a multi-element array.');
            }
          }
          if (!expanded || !expanded['@id']) {
            input['@id'] = 'http://example.org/' + defaultString + '-id';
          }
          return jsonldRx.defaultNormalize(input, options);
        });
      }
    });
  };

  /**
   * replaceContext Use a new context but otherwise avoid changes, e.g.,
   * keep free-floating nodes.
   *
   * @param {Object} input
   * @param {String|String[]|Object|Object[]} newContext
   * @return {Object} resultDoc
   */
  jsonldRx.replaceContext = function(input, newContext) {
    var timeout = 2 * 1000;
    newContext = !_.isEmpty(newContext) ? newContext : input['@context'];
    assert(_.isPlainObject(input), 'input in replaceContext should be a plain object');
    assert(_.isPlainObject(newContext), 'newContext in replaceContext should be a plain object');
    assert(_.values(newContext).length > 0, 'newContext in replaceContext should have at least one property');
    return jsonldRx.expand(input, {keepFreeFloatingNodes: true})
    .flatMap(function(expanded) {
      assert(_.isArray(expanded), 'expand in replaceContext should produce an array');
      return jsonldRx.compact(expanded, newContext, {skipExpansion: true});
    })
    .map(function(compactedAndCtx) {
      assert(_.isArray(compactedAndCtx), 'compactedAndCtx in replaceContext should produce an array');
      // return just the document, not the extra ctx element
      return compactedAndCtx[0];
    })
    .timeout(
        timeout,
        Rx.Observable.throw(new Error('jsonldRx.replaceContext timed out.'))
    )
  };

  /**
   * mergeContexts
   * TODO add a unit test for case where @vocab and a term map
   *      to the same IRI
   *
   * If multiple contexts are provided, any term or valueId collisions
   * will be resolved by using the term or valueId, respectively, from
   * the latest context (the one with the largest index in the provided
   * array of contexts).
   *
   * @param {Object[]} contexts (must be dereferenced)
   * @return {Object} mergedContext
   */
  //*
  jsonldRx.mergeContexts = function(contexts) {
    assert.ok(_.isArray(contexts), 'contexts in mergeContexts() should be an array');
    assert.ok(!_.isEmpty(contexts), 'contexts in mergeContexts() should not be empty');

    return _.reduce(contexts, function(acc, preferredContext) {
      assert.ok(_.isPlainObject(preferredContext), 'preferredContext in mergeContexts() should be a plain object');
      assert.ok(!preferredContext['@base'], 'preferredContext in mergeContexts() should not have @base property');
      assert.ok(!preferredContext.keepFreeFloatingNodes, 'preferredContext in mergeContexts() should not have keepFreeFloatingNodes property');

      // TODO what about a context with @base or @vocab wrt terms and valueIds?
      // We might think there's a collision when there really is not.

      // handle any valueId collisions
      var inverseAccumulator = getValueIdsAndKeysFromContext(acc);
      var inversePreferredContext = getValueIdsAndKeysFromContext(preferredContext);

      var collidingValueIds = _.intersection(
          _.keys(inverseAccumulator),
          _.keys(inversePreferredContext)
      );

      var specialIds = [
        '@vocab',
      ];

      collidingValueIds
      .map(function(valueId) {
        var accKey = inverseAccumulator[valueId];
        var preferredContextKey = inversePreferredContext[valueId];
        if (specialIds.indexOf(accKey) === -1 && accKey !== preferredContextKey) {
          console.warn('Colliding @id\'s: "' + valueId + '" is referred to by both "' +
            accKey + '" and "' + preferredContextKey + '".');
          console.warn('  Resolving collision by deleting term "' + accKey + '".');
          delete acc[accKey];
        }
      });

      var collidingTerms = _.intersection(
          _.keys(acc),
          _.keys(preferredContext)
      );

      collidingTerms
      .forEach(function(term) {
        var accValueId = acc[term]['@id'];
        var preferredContextValueId = preferredContext[term]['@id'];
        if (accValueId !== preferredContextValueId) {
          console.warn('Colliding Terms (Keywords): "' + term + '" is ambiguous, referring ' +
            'to both "' + accValueId + '" and ' +
              '"' + preferredContextValueId + '".');
          console.warn('  Resolving collision by specifying that "' + term +
            '" refers only to "' + preferredContextValueId + '"');
        }
      });

      // Add properties from preferred context, overwriting any term collisions
      _.assign(acc, preferredContext);

      return acc;
    }, {});
  };
  //*/

  var keysToNotOverwrite = ['@context', '@base', '@id'];

  function fillMissingInputTermsFromTransformContext(doc, transformerContextRaw, externalContextRaw) {
    assert(!externalContextRaw.documentLoader, 'externalContextRaw in fillMissingInputTermsFromTransformContext() should not have a "documentLoader" property');
    assert(!externalContextRaw.keepFreeFloatingNodes, 'externalContextRaw in fillMissingInputTermsFromTransformContext() should not have a "keepFreeFloatingNodes" property');

    assert(!transformerContextRaw.documentLoader, 'transformerContextRaw in fillMissingInputTermsFromTransformContext() should not have a "documentLoader" property');
    assert(!transformerContextRaw.keepFreeFloatingNodes, 'transformerContextRaw in fillMissingInputTermsFromTransformContext() should not have a "keepFreeFloatingNodes" property');

    // TODO probably don't need to do this
    var transformerContext = _.clone(transformerContextRaw) || {};
    var externalContext = _.clone(externalContextRaw) || {};
    if (_.isPlainObject(doc)) {
      var pairs = _.toPairs(doc)
      .filter(function(pair) {
        var key = pair[0];
        var value = pair[1];
        return keysToNotOverwrite.indexOf(key) === -1;
      });
      return _.reduce(pairs, function(acc, pair) {
        var key = pair[0];
        var value = pair[1];
        if (externalContext.hasOwnProperty(key)) {
          acc[key] = externalContext[key];
        } else if (transformerContext.hasOwnProperty(key)) {
          acc[key] = transformerContext[key];
        } else {
          acc[key] = 'http://example.org/no-context-term-specified/' + key;
        }
        return fillMissingInputTermsFromTransformContext(value, transformerContext, acc);
      }, externalContext);
    } else if (_.isArray(doc)) {
      return _.reduce(doc, function(acc, value) {
        return fillMissingInputTermsFromTransformContext(value, transformerContext, acc);
      }, externalContext);
    } else {
      return externalContext;
    }
  }

  function fillMissingOutputTermsFromTransformContext(doc, transformerContextRaw, externalContextRaw) {
    assert(!externalContextRaw.documentLoader, 'externalContextRaw in fillMissingOutputTermsFromTransformContext() should not have a "documentLoader" property');
    assert(!externalContextRaw.keepFreeFloatingNodes, 'externalContextRaw in fillMissingOutputTermsFromTransformContext() should not have a "keepFreeFloatingNodes" property');

    assert(!transformerContextRaw.documentLoader, 'transformerContextRaw in fillMissingOutputTermsFromTransformContext() should not have a "documentLoader" property');
    assert(!transformerContextRaw.keepFreeFloatingNodes, 'transformerContextRaw in fillMissingOutputTermsFromTransformContext() should not have a "keepFreeFloatingNodes" property');

    // TODO probably don't need to do this
    var transformerContext = _.clone(transformerContextRaw) || {};
    var externalContext = _.clone(externalContextRaw) || {};

    var transformerContextInverse = getValueIdsAndKeysFromContext(transformerContext);
    var externalContext = _.clone(externalContextRaw) || {};
    var externalContextInverse = getValueIdsAndKeysFromContext(externalContext);

    if (_.isPlainObject(doc)) {
      var pairs = _.toPairs(doc)
      .filter(function(pair) {
        var key = pair[0];
        return keysToNotOverwrite.concat(['@value']).indexOf(key) === -1;
      });
      return _.reduce(pairs, function(acc, pair) {
        var key = pair[0];
        var value = pair[1];
        if (externalContextInverse.hasOwnProperty(key)) {
          acc[externalContextInverse[key]] = key;
        } else if (transformerContextInverse.hasOwnProperty(key)) {
          acc[transformerContextInverse[key]] = key;
        } else {
          acc[key.split('http://example.org/no-context-term-specified/').pop()] = key;
        }
        return fillMissingOutputTermsFromTransformContext(value, transformerContext, acc);
      }, externalContext);
    } else if (_.isArray(doc)) {
      return _.reduce(doc, function(acc, value) {
        return fillMissingOutputTermsFromTransformContext(value, transformerContext, acc);
      }, externalContext);
    } else {
      return externalContext;
    }
  }

  var externalContextsMerged = {};
  /**
   * outside -> inside
   * replace external context (user-specified input context), if any, with transformer context.
   * Placeholder used for transformer context if not set.
   *
   * @param {Object} inputDoc
   * @param {String|String[]|Object|Object[]} externalContext
   * @return {Object} resultDoc
   */
  jsonldRx.toTransformerContext = function(inputDoc, externalContextRaw) {
    assert.ok(_.isPlainObject(inputDoc), 'inputDoc in toTransformerContext() should be a plain object');

    var externalContext$;
    if (!_.isEmpty(externalContextsMerged) || !_.isEmpty(externalContextRaw) || !_.isEmpty(inputDoc['@context'])) {
      var externalContexts = [externalContextsMerged]
      .concat(utils.arrayifyClean(inputDoc['@context']))
      .concat(utils.arrayifyClean(externalContextRaw));
      assert.ok(_.isArray(externalContexts), 'externalContexts in toTransformerContext() should be an array');
      externalContext$ = dereferenceContext(externalContexts);
    } else {
      externalContext$ = Rx.Observable.return(null);
    }

    assert.ok(_.isFunction(externalContext$.subscribe), 'externalContext$.subscribe in toTransformerContext() should be a function');

    return externalContext$
    .concatMap(function(externalContext) {
      assert(!externalContext || !externalContext.documentLoader, 'externalContext in toTransformerContext() should not have a "documentLoader" property');
      assert(!externalContext || !externalContext.keepFreeFloatingNodes, 'externalContext in toTransformerContext() should not have a "keepFreeFloatingNodes" property');
      if (!_.isEmpty(externalContext)) {
        // NOTE: side effect
        _.assign(externalContextsMerged, externalContext);
      }
      return jsonldRx.transformerContext(externalContext)
      .concatMap(function(transformerContext) {
        assert(_.isPlainObject(transformerContext), 'transformerContext in toTransformerContext() after concatMap should be an object');

        if (_.isEmpty(transformerContext)) {
          throw new Error('No transformerContext available in jsonldRx.toTransformerContext');
        }

        var filledExternalContext = fillMissingInputTermsFromTransformContext(inputDoc, transformerContext, externalContext);
        assert.ok(_.isPlainObject(filledExternalContext), 'filledExternalContext in toTransformerContext() after concatMap should be a plain object');
        // NOTE: side effect
        _.defaults(externalContextsMerged, filledExternalContext);
        inputDoc['@context'] = filledExternalContext;

        return jsonldRx.expand(inputDoc, transformerContext);
        //return jsonldRx.replaceContext(inputDoc, transformerContext);
      })
    });
  };

  /**
   * inside -> outside
   * replace transformer context with external context.
   *
   * @param {Object} transformedDoc
   * @return {Object} resultDoc
   */
  jsonldRx.toExternalContext = function(transformedDoc) {
    assert(!externalContextsMerged || !externalContextsMerged.documentLoader, 'externalContextsMerged in toExternalContext() should not have a "documentLoader" property');
    assert(!externalContextsMerged || !externalContextsMerged.keepFreeFloatingNodes, 'externalContextsMerged in toExternalContext() should not have a "keepFreeFloatingNodes" property');
    assert.ok(_.isArray(transformedDoc), 'transformedDoc in toExternalContext() should be an array');

    return jsonldRx.transformerContext()
    .concatMap(function(transformerContext) {
      // TODO we only want to include the terms that are missing from the original external context, but
      // the code below is not pulling them in.
      var filledExternalContext = fillMissingOutputTermsFromTransformContext(transformedDoc, transformerContext, externalContextsMerged);
      assert.ok(_.isPlainObject(filledExternalContext), 'filledExternalContext in toExternalContext() should be a plain object');
      // NOTE: side effect
      _.defaults(externalContextsMerged, filledExternalContext);
//      var filledExternalContext = jsonldRx.mergeContexts(
//          utils.arrayifyClean(transformerContext).concat(utils.arrayifyClean(externalContextsMerged))
//      );
      return jsonldRx.compact(transformedDoc, filledExternalContext)
      .map(function(compactedAndCtx) {
        return compactedAndCtx[0];
      });
    });
  };

  jsonldRx.arrayify = utils.arrayify;
  jsonldRx.arrayifyClean = utils.arrayifyClean;
  jsonldRx.defaultsDeep = utils.defaultsDeep;
  jsonldRx.matcher = new Matcher(jsonldRx);

  return jsonldRx;
};

module.exports = JsonldRx;
