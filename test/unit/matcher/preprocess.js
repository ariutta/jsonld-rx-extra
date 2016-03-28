var _ = require('lodash');
var chai = require('chai');
var chaiAsPromised = require('chai-as-promised');
var expect = chai.expect;
var fs = require('fs');
var http    =  require('http');
var hyperquest = require('hyperquest');
var leven = require('leven');
//var mockserver  =  require('mockserver');
var parse = require('csv-parse');
var JsonldRx = require('../../../lib/main.js');
var JsonldMatcher = require('../../../lib/matcher.js');
var Rx = require('rx');
var RxNode = require('rx-node-extra');
var sinon      = require('sinon');
var testUtils = require('../../test-utils');
var wd = require('wd');

var desired = {'browserName': 'phantomjs'};
desired.name = 'example with ' + desired.browserName;
desired.tags = ['dev-test'];

chai.use(chaiAsPromised);
chai.should();
chaiAsPromised.transferPromiseness = wd.transferPromiseness;

var jsonldRx = new JsonldRx();
var jsonldMatcher = new JsonldMatcher(jsonldRx);

var IDENTIFIERS = 'http://identifiers.org/';
var BRIDGEDB = 'http://vocabularies.bridgedb.org/ops#';
var DATASOURCES_LINKOUT_PATTERN_NS = BRIDGEDB + 'linkout_pattern';
var DATASOURCES_REGEX_NS = BRIDGEDB + 'regex';
var DATASOURCES_SYSTEM_CODE_NS = BRIDGEDB + 'system_code';
var DATASOURCES_URI_NS = BRIDGEDB + 'uri';
var DATASOURCES_WEBSITE_URL_NS = BRIDGEDB + 'website_url';

var logEnabled = !true;
function log(message) {
  if (logEnabled) {
    console.log(message);
  }
}

function normalizeText(inputText) {
  var stringifiedInput = inputText;
  if (!_.isString(inputText)) {
    if (_.isNumber(inputText) || _.isRegExp(inputText) ||
        _.isDate(inputText) || _.isBoolean(inputText)) {
      stringifiedInput = inputText.toString();
    } else if (_.isPlainObject(inputText)) {
      stringifiedInput = JSON.stringify(inputText);
    } else if (_.isUndefined(inputText)) {
      stringifiedInput = 'undefined';
    } else if (_.isNull(inputText)) {
      stringifiedInput = 'null';
    } else {
      console.warn('Cannot normalize provided value "' +
        JSON.stringify(inputText) + '".');
      console.warn('Using toString on input.');
      stringifiedInput = inputText.toString();
    }
  }
  // not using \w because we don't want to include the underscore
  var identifierPattern = /[^A-Za-z0-9]/gi;
  var alphanumericText = stringifiedInput.replace(identifierPattern, '');
  var normalizedText = alphanumericText;
  // This could be null if the inputText were something like '-..-'
  if (!_.isNull(alphanumericText)) {
    normalizedText = alphanumericText.toUpperCase();
  }
  return normalizedText;
}

describe('BridgeDb.jsonldMatcher.processReferenceRecords', function() {

  /************************************************
  * Start: Helper Functions
  *************************************************/
  /**
   * convertMiriamUrnToIdentifiersIri
   *
   * @param {object} dataset expanded dataset based on datasources.txt and
                             datasources_headers.txt
   * @param {array} dataset['http://vocabularies.bridgedb.org/ops#uri'] length is no more than 1
   * @param {object} dataset['http://vocabularies.bridgedb.org/ops#uri'][0]
   * @param {string} dataset['http://vocabularies.bridgedb.org/ops#uri'][0]['@id']
   *                 e.g., "urn:miriam:ncbigene"
   * @return {string} e.g., "http://identifiers.org/ncbigene/"
   */
  function convertMiriamUrnToIdentifiersIri(dataset) {
    var uriProperty = dataset[DATASOURCES_URI_NS];
    if (!!uriProperty && uriProperty.length === 1) {
      var uri = uriProperty[0]['@id'];
      // Making sure it's actually an identifiers.org namespace,
      // not a BridgeDb system code.
      // TODO need to update the @context online with the one locally
      // so the @id is processed as an @id.
      // compare this
      // https://github.com/bridgedb/BridgeDb/blob/master/
      //    org.bridgedb.rdf/resources/jsonld-context.jsonld
      // vs
      // https://github.com/bridgedb/BridgeDb/blob/OpenPHACTS/
      //    master/org.bridgedb.rdf/resources/jsonld-context.jsonld
      // vs
      // local
      log('dataset90');
      log(dataset);
      if (uri.indexOf('urn:miriam:') > -1) {
        var miriamRootUrn = uri;
        var preferredPrefix = miriamRootUrn.substring(11, miriamRootUrn.length);
        return IDENTIFIERS + preferredPrefix + '/';
      }
    }
  }

  /**
   * getPreferredPrefixFromMiriamUrn
   *
   * @param {object} dataset expanded dataset based on datasources.txt and
                             datasources_headers.txt
   * @param {array} dataset['http://vocabularies.bridgedb.org/ops#uri'] length is no more than 1
   * @param {object} dataset['http://vocabularies.bridgedb.org/ops#uri'][0]
   * @param {string} dataset['http://vocabularies.bridgedb.org/ops#uri'][0]['@id']
   *                 e.g., "urn:miriam:ncbigene"
   * @return {string} preferredPrefix from identifiers.org, e.g., "ncbigene"
   */
  function getPreferredPrefixFromMiriamUrn(dataset) {
    var uriProperty = dataset[DATASOURCES_URI_NS];
    if (!!uriProperty && uriProperty.length === 1) {
      var uri = uriProperty[0]['@id'];
      // Making sure it's actually an identifiers.org namespace,
      // not a BridgeDb system code.
      if (uri.indexOf('urn:miriam:') > -1) {
        var miriamRootUrn = uri;
        return miriamRootUrn.substring(11, miriamRootUrn.length);
      }
    }
  }
  /************************************************
  * End: Helper Functions
  *************************************************/

  log('start');

  describe('pre-process all datasources referenceRecords', function() {

    it('should pre-process, loading from file with many matchers', function(done) {
      var datasourcesContext = JSON.parse(
        fs.readFileSync(__dirname + '/jsonld-context.jsonld', {encoding: 'utf8'}));

      var m = 0;
      var datasourcesHeadersSource = RxNode.fromReadableStream(
          fs.createReadStream(__dirname + '/datasources_headers.txt')
          .pipe(parse({
            comment: '#',
            delimiter: '\t'
          }))
      )
      .map(function(array) {
        return {
          column: array[0],
          header: array[1],
          description: array[2],
          'example_entry': array[3]
        };
      })
      .map(function(headerDetail) {
        return headerDetail.header;
      })
      .doOnNext(function(value) {
        m += 1;
        log('datasourcesHeadersSource-' + m);
      });

      var l = 0;
      var datasourcesRowsSource = RxNode.fromReadableStream(
          fs.createReadStream(__dirname + '/datasources.txt')
          .pipe(parse({
            delimiter: '\t'
          }))
      )
      .doOnNext(function(value) {
        l += 1;
        log('datasourcesRowsSource-' + l);
      });

      var datasourcesContextElement = datasourcesContext['@context'];
      var j = 0;
      //*
      var datasourcesSource = datasourcesHeadersSource.toArray()
      .flatMap(function(headers) {
        var k = 0;
        return datasourcesRowsSource
        .map(function(rowEntries) {
          var seed = {
            '@context': datasourcesContextElement
          };

          return rowEntries.reduce(function(accumulator, rowEntry, index) {
            k += 1;
            log('reducer-' + k);
            if (rowEntry) {
              var header = headers[index];
              accumulator[header] = rowEntry;
            }
            return accumulator;
          }, seed);
        });
      })
      //*/
      /*
      datasourcesSource = datasourcesRowsSource
      .flatMap(function(rowEntrySource) {
        var k = 0;
        var seed = {
          '@context': datasourcesContextElement
        };
        return Rx.Observable.zip(datasourcesHeadersSource, Rx.Observable.from(rowEntrySource))
        .reduce(function(accumulator, zipped) {
          k += 1;
          log('reducer-' + k);
          var rowEntry = zipped[1];
          if (rowEntry) {
            var header = zipped[0];
            accumulator[header] = rowEntry;
          }
          return accumulator;
        }, seed);
      })
      //*/
      .doOnNext(function(value) {
        j += 1;
        log('datasources-' + j);
      })
      .shareReplay();

      var matchers = [{
        characteristics: [
          '@id',
          DATASOURCES_URI_NS,
          convertMiriamUrnToIdentifiersIri,
          DATASOURCES_WEBSITE_URL_NS,
        ],
        probabilityTruePositive: 0.999,
        probabilityFalsePositive: 0.03,
      }, {
        characteristics: [
          'http://vocabularies.bridgedb.org/ops#datasource_name',
          'http://schema.org/name',
          'http://vocabularies.bridgedb.org/ops#official_name',
          getPreferredPrefixFromMiriamUrn,
          DATASOURCES_SYSTEM_CODE_NS
        ],
        probabilityTruePositive: 0.8,
        probabilityFalsePositive: 0.05,
      }, {
        characteristics: [
          'http://vocabularies.bridgedb.org/ops#example_identifier',
          IDENTIFIERS + 'idot/exampleIdentifier',
        ],
        probabilityTruePositive: 0.99,
        probabilityFalsePositive: 0.1,
      }];

      var i = 0;
      jsonldMatcher._processReferenceRecords(datasourcesSource, matchers)
      .doOnNext(function() {
        i += 1;
        log('processed-' + i);
      })
      .toArray()
      .subscribe(function(actual) {
        log('expected-processed-datasources-many-matchers');
        log(JSON.stringify(actual, null, '  '));
        var expected = JSON.parse(fs.readFileSync(
          __dirname + '/expected-processed-datasources-many-matchers.jsonld',
          {encoding: 'utf8'}));
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
          fs.writeFileSync(
            __dirname + '/expected-processed-datasources-many-matchers-updated.jsonld',
            JSON.stringify(actual, null, '  '), {encoding: 'utf8'});
        }
        expect(actual).to.eql(expected);
      }, done, done);
    });

    it('should pre-process, loading from IRIs with many matchers', function(done) {
      var commitHash = '6843d72e6435c1e2593cab6e4e4eddad32a221e2';

      // URI for production:
      var contextIri = [
        'https://cdn.rawgit.com/bridgedb/BridgeDb/',
        commitHash,
        '/org.bridgedb.rdf/resources/jsonld-context.jsonld'
      ].join('');
      // URI for testing
      //    var contextUri = [
      //      'https://rawgit.com/bridgedb/BridgeDb/',
      //      commitHash,
      //      '/org.bridgedb.rdf/resources/jsonld-context.jsonld'
      //    ].join('');

      var datasourcesContextElementSource = RxNode.fromReadableStream(
        hyperquest(contextIri, {
          withCredentials: false
        })
      )
      .map(function(contextString) {
        var context = JSON.parse(contextString);
        return context['@context'];
      });

      var datasetsHeadersIri = [
        'https://cdn.rawgit.com/bridgedb/BridgeDb/',
        commitHash,
        '/org.bridgedb.bio/resources/org/bridgedb/bio/datasources_headers.txt',
      ].join('');

      var m = 0;
      var datasourcesHeadersSource = RxNode.fromReadableStream(
        hyperquest(datasetsHeadersIri, {
          withCredentials: false
        })
        .pipe(parse({
          comment: '#',
          delimiter: '\t'
        }))
      )
      .map(function(array) {
        return {
          column: array[0],
          header: array[1],
          description: array[2],
          'example_entry': array[3]
        };
      })
      .map(function(headerDetail) {
        return headerDetail.header;
      })
      .doOnNext(function(value) {
        m += 1;
        log('datasourcesHeadersSource-' + m);
      });

      var datasetsMetadataIri = [
        'https://cdn.rawgit.com/bridgedb/BridgeDb/',
        commitHash,
        '/org.bridgedb.bio/resources/org/bridgedb/bio/datasources.txt',
      ].join('');

      var l = 0;
      var datasourcesRowsSource = RxNode.fromReadableStream(
        hyperquest(datasetsMetadataIri, {
          withCredentials: false
        })
        .pipe(parse({
          delimiter: '\t'
        }))
      )
      .doOnNext(function(value) {
        l += 1;
        log('datasourcesRowsSource-' + l);
      });

      var j = 0;
      var datasourcesSource = datasourcesHeadersSource.toArray()
      .zip(datasourcesContextElementSource)
      .flatMap(function(zipped) {
        var headers = zipped[0];
        var datasourcesContextElement = zipped[1];
        var k = 0;
        return datasourcesRowsSource
        .map(function(rowEntries) {
          var seed = {
            '@context': datasourcesContextElement
          };

          return rowEntries.reduce(function(accumulator, rowEntry, index) {
            k += 1;
            log('reducer-' + k);
            if (rowEntry) {
              var header = headers[index];
              accumulator[header] = rowEntry;
            }
            return accumulator;
          }, seed);
        });
      })
      .shareReplay();

      var matchers = [{
        characteristics: [
          '@id',
          DATASOURCES_URI_NS,
          convertMiriamUrnToIdentifiersIri,
          DATASOURCES_WEBSITE_URL_NS,
        ],
        probabilityTruePositive: 0.999,
        probabilityFalsePositive: 0.03,
      }, {
        characteristics: [
          'http://vocabularies.bridgedb.org/ops#datasource_name',
          'http://schema.org/name',
          'http://vocabularies.bridgedb.org/ops#official_name',
          getPreferredPrefixFromMiriamUrn,
          DATASOURCES_SYSTEM_CODE_NS
        ],
        probabilityTruePositive: 0.8,
        probabilityFalsePositive: 0.05,
      }, {
        characteristics: [
          'http://vocabularies.bridgedb.org/ops#example_identifier',
          IDENTIFIERS + 'idot/exampleIdentifier',
        ],
        probabilityTruePositive: 0.99,
        probabilityFalsePositive: 0.1,
      }];

      jsonldMatcher._processReferenceRecords(datasourcesSource, matchers)
      .doOnError(done)
      .doOnError(done)
      .toArray()
      .subscribe(function(actual) {
        log('expected-processed-datasources-many-matchers');
        log(JSON.stringify(actual, null, '  '));
        var expected = JSON.parse(fs.readFileSync(
          __dirname + '/expected-processed-datasources-many-matchers.jsonld',
          {encoding: 'utf8'}));
        if (JSON.stringify(expected) !== JSON.stringify(actual)) {
          fs.writeFileSync(
            __dirname + '/expected-processed-datasources-many-matchers-updated.jsonld',
            JSON.stringify(actual, null, '  '), {encoding: 'utf8'});
        }
        log('equal?');
        log(JSON.stringify(expected) === JSON.stringify(actual));
        expect(actual).to.eql(expected);
      }, done, done);
    });

    it('should pre-process, loading from IRIs w/ matchers for GPML <-> BridgeDb', function(done) {
      var commitHash = '6843d72e6435c1e2593cab6e4e4eddad32a221e2';

      // URI for production:
      var contextIri = [
        'https://cdn.rawgit.com/bridgedb/BridgeDb/',
        commitHash,
        '/org.bridgedb.rdf/resources/jsonld-context.jsonld'
      ].join('');
      // URI for testing
      //    var contextUri = [
      //      'https://rawgit.com/bridgedb/BridgeDb/',
      //      commitHash,
      //      '/org.bridgedb.rdf/resources/jsonld-context.jsonld'
      //    ].join('');

      var datasourcesContextElementSource = RxNode.fromReadableStream(
        hyperquest(contextIri, {
          withCredentials: false
        })
      )
      .map(function(contextString) {
        var context = JSON.parse(contextString);
        return context['@context'];
      });

      var datasetsHeadersIri = [
        'https://cdn.rawgit.com/bridgedb/BridgeDb/',
        commitHash,
        '/org.bridgedb.bio/resources/org/bridgedb/bio/datasources_headers.txt',
      ].join('');

      var m = 0;
      var datasourcesHeadersSource = RxNode.fromReadableStream(
        hyperquest(datasetsHeadersIri, {
          withCredentials: false
        })
        .pipe(parse({
          comment: '#',
          delimiter: '\t'
        }))
      )
      .map(function(array) {
        return {
          column: array[0],
          header: array[1],
          description: array[2],
          'example_entry': array[3]
        };
      })
      .map(function(headerDetail) {
        return headerDetail.header;
      })
      .doOnNext(function(value) {
        m += 1;
        log('datasourcesHeadersSource-' + m);
      });

      var datasetsMetadataIri = [
        'https://cdn.rawgit.com/bridgedb/BridgeDb/',
        commitHash,
        '/org.bridgedb.bio/resources/org/bridgedb/bio/datasources.txt',
      ].join('');

      var l = 0;
      var datasourcesRowsSource = RxNode.fromReadableStream(
        hyperquest(datasetsMetadataIri, {
          withCredentials: false
        })
        .pipe(parse({
          delimiter: '\t'
        }))
      )
      .doOnNext(function(value) {
        l += 1;
        log('datasourcesRowsSource-' + l);
      });

      //var datasourcesContextElement = contextIri;
      var j = 0;
      //*
      var datasourcesSource = datasourcesHeadersSource.toArray()
      .zip(datasourcesContextElementSource)
      .flatMap(function(zipped) {
        var headers = zipped[0];
        var datasourcesContextElement = zipped[1];
        var k = 0;
        return datasourcesRowsSource
        .map(function(rowEntries) {
          var seed = {
            '@context': datasourcesContextElement
          };

          return rowEntries.reduce(function(accumulator, rowEntry, index) {
            k += 1;
            log('reducer-' + k);
            if (rowEntry) {
              var header = headers[index];
              accumulator[header] = rowEntry;
            }
            return accumulator;
          }, seed);
        });
      })
      //*/
      .doOnNext(function(value) {
        j += 1;
        log('datasources-' + j);
        log(JSON.stringify(value, null, '  '));
      })
      .shareReplay();

      var matchers = [{
        characteristics: [
          BRIDGEDB + 'datasource_name'
        ],
        probabilityTruePositive: 0.9,
        probabilityFalsePositive: 0.05,
      }];

      var i = 0;
      jsonldMatcher._processReferenceRecords(datasourcesSource, matchers)
      .doOnError(done)
      .doOnNext(function(referenceRecord) {
        log('referenceRecord');
        log(JSON.stringify(referenceRecord, null, '  '));
        //var currentName = referenceRecord[0]['@value']['datasource_name'];
        //expect(currentName).to.not.eql(latestName);
        //latestName = currentName;
      })
      .doOnNext(function() {
        i += 1;
        log('processed-' + i);
      })
      .doOnError(done)
      .toArray()
      .subscribe(function(actual) {
        log('expected-processed-datasources-for-gpml2bridgedb');
        log(JSON.stringify(actual, null, '  '));
        var expected = JSON.parse(fs.readFileSync(
          __dirname + '/expected-processed-datasources-for-gpml2bridgedb.jsonld',
          {encoding: 'utf8'}));
        if (JSON.stringify(expected) !== JSON.stringify(actual)) {
          fs.writeFileSync(
            __dirname + '/expected-processed-datasources-for-gpml2bridgedb-updated.jsonld',
            JSON.stringify(actual, null, '  '), {encoding: 'utf8'});
        }
        log('equal?');
        log(JSON.stringify(expected) === JSON.stringify(actual));
        expect(actual).to.eql(expected);
      }, done, done);
    });

  });

});
