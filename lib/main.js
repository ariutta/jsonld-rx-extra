var _ = require('lodash');
var jsonldRxPlain = require('jsonld-rx');
var Rx = require('rx-extra');
var utils = require('./utils.js');

//TODO normalize first
//var preferredContextHash = jsonld.sha1.hash(JSON.stringify(preferredContext));

Rx.Observable.prototype.toNodeCallback = function(cb) {
  var source = this;
  return function() {
    var val;
    var hasVal = false;
    source.subscribe(
      function(x) {
        hasVal = true;
        val = x;
      },
      function(e) {
        cb(e);
      },
      function() {
        if (hasVal) {
          cb(null, val);
        }
      }
    );
  };
};

var JsonldRx = function(options) {
  options = options || {};
  var jsonldRx = jsonldRxPlain(options);

  jsonldRx.defaultContext = options.defaultContext;

  function fillMissingContext(input, defaultContext) {
    defaultContext = defaultContext || jsonldRx.defaultContext;
    if (_.isPlainObject(input)) {
      input['@context'] = input['@context'] || defaultContext;
    } else if (_.isArray(input)) {
      input = input.map(function(subDoc) {
        subDoc['@context'] = subDoc['@context'] || defaultContext;
        return subDoc;
      });
    }
    return input;
  }

  // TODO fix this
  jsonldRx._runOnceGlobal = options._runOnceGlobal;

  /**
   * dereferenceContext
   *
   * @param {String|String[]|Object|Object[]} inputContext
   * @return {Object[]} output same as input, except any contexts
   *    referenced as IRIs (external contexts) are dereferenced (embedded)
   */
  function dereferenceContext(inputContext) {
    if (!inputContext) {
      throw new Error('No context provided in jsonldRx.dereferenceContext');
    }

    var inputContextArray = utils.arrayifyClean(inputContext);

    return Rx.Observable.from(inputContextArray)
      .flatMap(function(inputContextElement) {
        // A inputContextElement can be any of the following:
        // * the full inputContext, if the inputContext is an IRI
        // * one of one or more contexts, if the inputContext is an array,
        //   each element of which can be either:
        //   - an IRI (external) or
        //   - a plain object (embedded)

        if (!_.isString(inputContextElement)) {
          return Rx.Observable.return(inputContextElement);
        }

        return jsonldRx._dereferenceDocument(inputContextElement)
          .map(function(contextEnvelope) {
            return contextEnvelope['@context'];
          });
      })
      .toArray();
  }

  /**
   * dereferenceOneContext
   *
   * @param {String} iri referencing an external context
   * @return {Object} context that is dereferenced (embedded)
   */
  function dereferenceOneContext(iri) {
    return dereferenceContext(iri)
      .map(function(contextArray) {
        return contextArray[0];
      });
  }

  /**
   * embedContexts
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
        doc['@context'] = embeddedDocContext;
        return doc;
      });
  }

  function getValueIdsAndKeysFromContext(context) {
    return _.pairs(context).reduce(function(accumulator, pair) {
      var key = pair[0];
      var value = pair[1];
      var valueId;
      if (_.isString(value)) {
        valueId = value;
      } else if (value['@id']) {
        valueId = value['@id'];
      } else if (value['@reverse']) {
        return;
      } else {
        console.warn(value);
        throw new Error('Cannot handle this context value.');
      }
      if (valueId) {
        accumulator[valueId] = key;
      }
      return accumulator;
    }, {});
  }

  function getValueIdsAndKeysFromContextMappings(mappings) {
    return _.pairs(mappings).reduce(function(accumulator, pair) {
      var key = pair[0];
      var value = pair[1];
      var valueId;
      if (value['@id']) {
        valueId = value['@id'];
      } else {
        console.warn(value);
        throw new Error('Cannot handle this context value.');
      }
      accumulator[valueId] = key;
      return accumulator;
    }, {});
  }

  jsonldRx.defaultNormalize = function(input, options) {
    fillMissingContext(input);
    options = options || {};
    var defaultOptions = {format: 'application/nquads'};
    _.defaults(options, defaultOptions);
    return jsonldRx.normalize(input, options);
  };

  /**
   * replaceContext Use a new context but otherwise avoid changes, e.g.,
   * keep free-floating nodes.
   *
   * @param {String|String[]|Object|Object[]} input
   * @param {String|String[]|Object|Object[]} newContext
   * @return {Object|Object[]} resultDoc
   */
  jsonldRx.replaceContext = function(input, newContext) {
    fillMissingContext(input, jsonldRx.defaultContext || newContext);
    newContext = newContext || input['@context'];
    return jsonldRx.expand(input, {keepFreeFloatingNodes: true})
      .flatMap(function(expanded) {
        return jsonldRx.compact(expanded, newContext, {skipExpansion: true});
      })
      .map(function(compactedAndCtx) {
        // return just the document, not the extra ctx element
        return compactedAndCtx[0];
      });
  };

  /**
   * mergeContexts
   *
   * If multiple contexts are provided, any term or valueId collisions
   * will be resolved by using the term or valueId, respectively, from
   * the latest context (the one with the largest index in the provided
   * array of contexts).
   *
   * @param {String|String[]|Object|Object[]} contexts
   * @return {Object} mergedContext
   */
  //*
  jsonldRx.mergeContexts = function(contexts) {
    if (_.isPlainObject(contexts)) {
      return Rx.Observable.return(contexts);
    } else if (_.isString(contexts)) {
      return dereferenceContext(contexts);
    }

    var cacheKey = JSON.stringify(contexts);

    var mergedContextSourceCache = jsonldRx._cache.get(cacheKey);

    if (mergedContextSourceCache) {
      return mergedContextSourceCache;
    }

    var mergedContextSource = Rx.Observable.from(contexts)
      // NOTE the 'distinct' operator keeps the first if there are duplicates,
      //    e.g., [1, 2, 2, 1] -> [1, 2]
      // We want to keep just the last if there are any duplicates.
      .reduce(function(accumulator, context) {
        var stringifiedContext = JSON.stringify(context);
        accumulator[stringifiedContext] = {
          context: context,
          index: accumulator.index
        };
        accumulator.index += 1;
        return accumulator;
      }, {index: 0})
      .flatMap(function(hashMap) {
        delete hashMap.index;
        return Rx.Observable.pairs(hashMap)
          .reduce(function(accumulator, item) {
            var itemValue = item[1];
            accumulator[itemValue.index] = itemValue.context;
            return accumulator;
          }, [])
          .flatMap(function(contexts) {
            return Rx.Observable.from(contexts)
              .filter(function(context) {
                return context;
              });
          });
      })
      .concatMap(function(context) {
        return Rx.Observable.return(context)
          .flatMap(dereferenceOneContext)
          .flatMap(function(dereferencedContext) {
            // Doing this because the context processor method
            // doesn't appear to be public.
            var placeholderDoc = {
              '@context': dereferencedContext,
              '@id': 'http://example.org/placeholder',
              '@type': 'gpml:GeneProduct'
            };
            return jsonldRx.compact(placeholderDoc, dereferencedContext)
              .map(function(result) {
                var newContext = result[1];
                var inverse = newContext.inverse;
                return newContext;
              });
          });
      })
      .reduce(function(accumulator, preferredContext) {
        var base = preferredContext['@base'].href;
        if (base) {
          accumulator['@base'] = base;
        }
        var vocab = preferredContext['@vocab'];
        if (vocab) {
          accumulator['@vocab'] = vocab;
        }
        // TODO what about a context with @base or @vocab wrt terms and valueIds?
        // We might think there's a collision when there really is not.

        var preferredContextMappings = preferredContext.mappings;
        // handle any valueId collisions
        var inverseAccumulator = getValueIdsAndKeysFromContext(accumulator);
        //var inversePreferredContext = getValueIdsAndKeysFromContext(preferredContext);
        //var inversePreferredContext = preferredContext.inverse;
        var inversePreferredContext = getValueIdsAndKeysFromContextMappings(
            preferredContextMappings);
        var collidingValueIds = _.intersection(
            _.keys(inverseAccumulator), _.keys(inversePreferredContext));
        collidingValueIds
          .map(function(valueId) {
            var accumulatorKey = inverseAccumulator[valueId];
            var preferredContextKey = inversePreferredContext[valueId];
            if (accumulatorKey !== preferredContextKey) {
              console.warn('Colliding @id\'s: "' + valueId + '" is referred to by both "' +
                accumulatorKey + '" and "' + preferredContextKey + '".');
              console.warn('  Resolving collision by deleting term "' + accumulatorKey + '".');
              delete accumulator[accumulatorKey];
            }
          });

        var collidingTerms = _.intersection(
            _.keys(accumulator), _.keys(preferredContextMappings));
        collidingTerms
          .forEach(function(term) {
            var accumulatorValueId = accumulator[term]['@id'];
            var preferredContextValueId = preferredContextMappings[term]['@id'];
            if (accumulatorValueId !== preferredContextValueId) {
              console.warn('Colliding Terms (Keywords): "' + term + '" is ambiguous, referring ' +
                'to both "' + accumulatorValueId + '" and ' +
                  '"' + preferredContextValueId + '".');
              console.warn('  Resolving collision by specifying that "' + term +
                '" refers only to "' + preferredContextValueId + '"');
            }
          });

        // Add properties from preferred context, overwriting any term collisions
        _.assign(accumulator, preferredContextMappings);
        return accumulator;
      }, {});

    mergedContextSourceCache = new Rx.ReplaySubject(1);
    mergedContextSource.subscribe(function(value) {
      mergedContextSourceCache.onNext(value);
    }, function(err) {
      throw err;
    }, function() {
      mergedContextSourceCache.onCompleted();
    });
    jsonldRx._cache.set(cacheKey, mergedContextSourceCache);
    return mergedContextSourceCache;
  };
  //*/

  jsonldRx.arrayify = utils.arrayify;
  jsonldRx.arrayifyClean = utils.arrayifyClean;
  jsonldRx.defaultsDeep = utils.defaultsDeep;
  jsonldRx.hierarchicalPartition = utils.hierarchicalPartition;

  return jsonldRx;
};

module.exports = JsonldRx;