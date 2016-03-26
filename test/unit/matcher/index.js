var _ = require('lodash');
var chai = require('chai');
var chaiAsPromised = require('chai-as-promised');
//var colors = require('colors');
var expect = chai.expect;
var fs = require('fs');
var http    =  require('http');
var leven = require('leven');
//var mockserver  =  require('mockserver');
var parse = require('csv-parse');
//var run = require('gulp-run');
var JsonldRx = require('../../../lib/main.js');
var JsonldMatcher = require('../../../lib/matcher.js');
var Rx = require('rx');
var sinon      = require('sinon');
var testUtils = require('../../test-utils');
var wd = require('wd');

var jsonldRx = new JsonldRx();
var jsonldMatcher = new JsonldMatcher(jsonldRx);

var desired = {'browserName': 'phantomjs'};
desired.name = 'example with ' + desired.browserName;
desired.tags = ['dev-test'];

chai.use(chaiAsPromised);
chai.should();
chaiAsPromised.transferPromiseness = wd.transferPromiseness;

var IDENTIFIERS = 'http://identifiers.org/';
var BRIDGEDB = 'http://vocabularies.bridgedb.org/ops#';
var DATASOURCES_LINKOUT_PATTERN_NS = BRIDGEDB + 'linkout_pattern';
var DATASOURCES_REGEX_NS = BRIDGEDB + 'regex';
var DATASOURCES_SYSTEM_CODE_NS = BRIDGEDB + 'system_code';
var DATASOURCES_URI_NS = BRIDGEDB + 'uri';
var DATASOURCES_WEBSITE_URL_NS = BRIDGEDB + 'website_url';

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

describe('BridgeDb.jsonldMatcher.filter', function() {

  describe('simple object as recordToMatch', function() {

    describe('few reference records - process them every time (no pre-processing)', function() {
      var smallReferenceRecordsSource = Rx.Observable.from([
        {
          '@context': 'http://schema.org',
          '@type': 'Person',
          'name': 'Paul McCartney',
          '@id': 'http://musicbrainz.org/artist/ba550d0e-adac-4864-b88b-407cab5e76af'
        },
        {
          '@context': [
            'http://json-ld.org/contexts/person.jsonld',
            {
              'pic': 'http://xmlns.com/foaf/0.1/depiction'
            }
          ],
          'name': 'Manu Sporny',
          'homepage': 'http://manu.sporny.org/',
          'pic': 'http://twitter.com/account/profile_image/manusporny'
        }
      ]);

      it('should filter by @id', function(done) {
        var recordToMatch = {
          '@id': 'http://musicbrainz.org/artist/ba550d0e-adac-4864-b88b-407cab5e76af'
        };

        var expected = [
          [
            '@id',
            'http://musicbrainz.org/artist/ba550d0e-adac-4864-b88b-407cab5e76af'
          ]
        ];

        jsonldMatcher.filter(recordToMatch, smallReferenceRecordsSource)
        .first()
        .map(function(result) {
          return result.value;
        })
        .doOnError(done)
        .toArray()
        .doOnNext(function(results) {
          expect(results.length).to.equal(1);
          var actual = results[0];
          expect(actual.id).to.equal(
            'http://musicbrainz.org/artist/ba550d0e-adac-4864-b88b-407cab5e76af');
        })
        .doOnError(done)
        .subscribeOnCompleted(done);
      });
    });

    describe('many reference records - pre-process them so as to process only once', function() {

      var matchers = [{
        characteristicKeys: ['@id']
      }, {
        characteristicKeys: [
          'http://schema.org/name',
          'http://xmlns.com/foaf/0.1/name',
        ],
        normalize: normalizeText,
      }];

      var referenceRecordsSource;
      var expected = {
        '@context': 'http://schema.org/',
        id: 'http://musicbrainz.org/artist/ba550d0e-adac-4864-b88b-407cab5e76af',
        type: 'Person',
        name: 'Paul McCartney'
      };

      before(function(done) {
        referenceRecordsSource = Rx.Observable.fromNodeCallback(fs.readdir)(
            __dirname + '/input-data')
        .flatMap(Rx.Observable.from)
        .filter(function(name) {
          return name[0] !== '.' && name.slice(-7) === '.jsonld';
        })
        .map(function(name) {
          return fs.readFileSync(__dirname + '/input-data/' + name, {encoding: 'utf8'});
        })
        .map(JSON.parse)
        .let(function(source) {
          return jsonldMatcher._processReferenceRecords(source, matchers);
        })
        .shareReplay();

        referenceRecordsSource
        .doOnError(done)
        .subscribeOnCompleted(done);
      });

      it('should filter by @id', function(done) {
        var recordToMatch = {
          '@id': 'http://musicbrainz.org/artist/ba550d0e-adac-4864-b88b-407cab5e76af'
        };

        jsonldMatcher.filter(
          recordToMatch,
          referenceRecordsSource,
          null,
          {
            skipReferenceRecordExpansion: true,
          }
        )
        .first()
        .map(function(result) {
          return result.value;
        })
        .doOnError(done)
        .toArray()
        .doOnNext(function(results) {
          expect(results.length).to.equal(1);
          var actual = results[0];
          expect(actual.id).to.equal(
            'http://musicbrainz.org/artist/ba550d0e-adac-4864-b88b-407cab5e76af');
        })
        .doOnError(done)
        .subscribeOnCompleted(done);
      });

      it('should filter by @id with conflicting profession property', function(done) {
        var recordToMatch = {
          '@id': 'http://musicbrainz.org/artist/ba550d0e-adac-4864-b88b-407cab5e76af',
          'name': 'Paul McCartney',
          'profession': 'artist'
        };

        jsonldMatcher.filter(
          recordToMatch,
          referenceRecordsSource,
          null,
          {
            skipReferenceRecordExpansion: true,
          }
        )
        .first()
        .map(function(result) {
          return result.value;
        })
        .doOnError(done)
        .toArray()
        .doOnNext(function(results) {
          expect(results.length).to.equal(1);
          var actual = results[0];
          expect(actual.id).to.equal(
            'http://musicbrainz.org/artist/ba550d0e-adac-4864-b88b-407cab5e76af');
        })
        .doOnError(done)
        .subscribeOnCompleted(done);
      });

      it('should filter by name', function(done) {
        var recordToMatch = {
          '@id': 'http://dbpedia.org/resource/Paul_McCartney',
          'name': 'Paul McCartney'
        };

        var MIN_FUZZY_MATCH_SCORE = 0.9;
        var matchers = [{
          characteristicKeys: [
            'http://schema.org/name',
            'name',
            'label',
            'alternateName',
            'prefLabel',
            'altLabel',
            'hiddenLabel',
          ],
          normalize: normalizeText,
          tests: [
            function(referenceRecord, referenceRecordName, recordToMatch, recordToMatchName) {
              var matchScore = 1 - (leven(recordToMatchName, referenceRecordName) /
              recordToMatchName.length);
              return matchScore >= MIN_FUZZY_MATCH_SCORE;
            }
          ]
        }];

        var options = {
          skipReferenceRecordExpansion: true,
        };

        jsonldMatcher.filter(
          recordToMatch,
          referenceRecordsSource,
          matchers,
          options
        )
        .first()
        .map(function(result) {
          return result.value;
        })
        .doOnError(done)
        .toArray()
        .doOnNext(function(results) {
          expect(results.length).to.equal(1);
          var actual = results[0];
          expect(actual.id).to.equal(
            'http://musicbrainz.org/artist/ba550d0e-adac-4864-b88b-407cab5e76af');
        })
        .doOnError(done)
        .subscribeOnCompleted(done);
      });

      it('should filter by name without @id', function(done) {
        var recordToMatch = {
          'name': 'Paul McCartney'
        };

        var MIN_FUZZY_MATCH_SCORE = 0.9;
        var matchers = [{
          characteristicKeys: [
            'http://schema.org/name',
            'name',
            'label',
            'alternateName',
            'prefLabel',
            'altLabel',
            'hiddenLabel',
          ],
          normalize: normalizeText,
          probabilityTruePositive: 0.9,
          probabilityFalsePositive: 0.03,
          tests: [
            function(referenceRecord, referenceRecordName, recordToMatch, recordToMatchName) {
              var matchScore = 1 - (leven(recordToMatchName, referenceRecordName) /
                  recordToMatchName.length);
              return matchScore >= MIN_FUZZY_MATCH_SCORE;
            }
          ]
        }];

        var options = {
          skipReferenceRecordExpansion: true,
        };

        jsonldMatcher.filter(
          recordToMatch,
          referenceRecordsSource,
          matchers,
          options
        )
        .first()
        .map(function(result) {
          return result.value;
        })
        .doOnError(done)
        .toArray()
        .doOnNext(function(results) {
          expect(results.length).to.equal(1);
          var actual = results[0];
          expect(actual.id).to.equal(
            'http://musicbrainz.org/artist/ba550d0e-adac-4864-b88b-407cab5e76af');
        })
        .doOnError(done)
        .subscribeOnCompleted(done);
      });

      it('should filter by name (case insensitive)', function(done) {
        var recordToMatch = {
          'name': 'paul mccartney'
        };

        var MIN_FUZZY_MATCH_SCORE = 0.9;
        var matchers = [{
          characteristicKeys: [
            'http://schema.org/name',
            'name',
            'label',
            'alternateName',
            'prefLabel',
            'altLabel',
            'hiddenLabel',
          ],
          probabilityTruePositive: 0.8,
          probabilityFalsePositive: 0.05,
          normalize: normalizeText,
          tests: [
            function(referenceRecord, referenceRecordName, recordToMatch, recordToMatchName) {
              var matchScore = 1 - (leven(recordToMatchName, referenceRecordName) /
                  recordToMatchName.length);
              return matchScore >= MIN_FUZZY_MATCH_SCORE;
            }
          ]
        }];

        var options = {
          skipReferenceRecordExpansion: true,
        };

        jsonldMatcher.filter(
          recordToMatch,
          referenceRecordsSource,
          matchers,
          options
        )
        .first()
        .map(function(result) {
          return result.value;
        })
        .doOnError(done)
        .toArray()
        .doOnNext(function(results) {
          expect(results.length).to.equal(1);
          var actual = results[0];
          expect(actual.id).to.equal(
            'http://musicbrainz.org/artist/ba550d0e-adac-4864-b88b-407cab5e76af');
        })
        .doOnError(done)
        .subscribeOnCompleted(done);
      });

      it('should filter by name (w/ threshold)', function(done) {
        var recordToMatch = {
          'name': 'Paul McCartney'
        };

        var MIN_FUZZY_MATCH_SCORE = 0.9;
        var matchers = [{
          characteristicKeys: [
            'http://schema.org/name',
            'name',
            'label',
            'alternateName',
            'prefLabel',
            'altLabel',
            'hiddenLabel',
          ],
          probabilityTruePositive: 0.8,
          probabilityFalsePositive: 0.05,
          normalize: normalizeText,
          tests: [
            function(referenceRecord, referenceRecordName, recordToMatch, recordToMatchName) {
              var matchScore = 1 - (leven(recordToMatchName, referenceRecordName) /
                  recordToMatchName.length);
              return matchScore >= MIN_FUZZY_MATCH_SCORE;
            }
          ]
        }];

        var options = {
          skipReferenceRecordExpansion: true,
          threshold: 3,
        };

        jsonldMatcher.filter(
          recordToMatch,
          referenceRecordsSource,
          matchers,
          options
        )
        .first()
        .map(function(result) {
          return result.value;
        })
        .doOnError(done)
        .toArray()
        .doOnNext(function(results) {
          expect(results.length).to.equal(1);
          var actual = results[0];
          expect(actual.id).to.equal(
            'http://musicbrainz.org/artist/ba550d0e-adac-4864-b88b-407cab5e76af');
        })
        .doOnError(done)
        .subscribeOnCompleted(done);
      });

      it('should filter by owl:sameAs (string)', function(done) {
        var recordToMatch = {
          '@context': {
            owl: 'http://www.w3.org/2002/07/owl#',
            'owl:sameAs': {
              '@type': '@id',
              '@container': '@set',
              '@id': 'owl:sameAs'
            }
          },
          '@id': 'http://dbpedia.org/resource/Paul_McCartney',
          'owl:sameAs': 'http://musicbrainz.org/artist/ba550d0e-adac-4864-b88b-407cab5e76af',
          'givenName': 'Paul'
        };

        jsonldMatcher.filter(
          recordToMatch,
          referenceRecordsSource,
          null,
          {
            skipReferenceRecordExpansion: true,
          }
        )
        .first()
        .map(function(result) {
          return result.value;
        })
        .doOnError(done)
        .toArray()
        .doOnNext(function(results) {
          expect(results.length).to.equal(1);
          var actual = results[0];
          expect(actual.id).to.equal(
            'http://musicbrainz.org/artist/ba550d0e-adac-4864-b88b-407cab5e76af');
        })
        .doOnError(done)
        .subscribeOnCompleted(done);
      });

      it('should filter by owl:sameAs (array)', function(done) {
        var recordToMatch = {
          '@context': {
            owl: 'http://www.w3.org/2002/07/owl#',
            'owl:sameAs': {
              '@type': '@id',
              '@container': '@set',
              '@id': 'owl:sameAs'
            }
          },
          '@id': 'http://dbpedia.org/resource/Paul_McCartney',
          'owl:sameAs': ['http://musicbrainz.org/artist/ba550d0e-adac-4864-b88b-407cab5e76af'],
          'givenName': 'Paul'
        };

        jsonldMatcher.filter(
          recordToMatch,
          referenceRecordsSource,
          null,
          {
            skipReferenceRecordExpansion: true,
          }
        )
        .first()
        .map(function(result) {
          return result.value;
        })
        .doOnError(done)
        .toArray()
        .doOnNext(function(results) {
          expect(results.length).to.equal(1);
          var actual = results[0];
          expect(actual.id).to.equal(
            'http://musicbrainz.org/artist/ba550d0e-adac-4864-b88b-407cab5e76af');
        })
        .doOnError(done)
        .subscribeOnCompleted(done);
      });

      it('should filter a compacted JSON-LD document by @id (base)', function(done) {
        var recordToMatch = {
          '@context': {
            '@base': 'http://musicbrainz.org/artist/'
          },
          '@id': 'ba550d0e-adac-4864-b88b-407cab5e76af'
        };

        jsonldMatcher.filter(
          recordToMatch,
          referenceRecordsSource,
          null,
          {
            skipReferenceRecordExpansion: true,
          }
        )
        .first()
        .map(function(result) {
          return result.value;
        })
        .doOnError(done)
        .toArray()
        .doOnNext(function(results) {
          expect(results.length).to.equal(1);
          var actual = results[0];
          expect(actual.id).to.equal(
            'http://musicbrainz.org/artist/ba550d0e-adac-4864-b88b-407cab5e76af');
        })
        .doOnError(done)
        .subscribeOnCompleted(done);
      });

      it('should filter a compacted JSON-LD document by @id (compact IRI)', function(done) {
        var recordToMatch = {
          '@context': {
            musicbrainz: {
              '@type': '@id',
              '@id': 'http://musicbrainz.org/artist/'
            }
          },
          '@id': 'musicbrainz:ba550d0e-adac-4864-b88b-407cab5e76af'
        };

        jsonldMatcher.filter(
          recordToMatch,
          referenceRecordsSource,
          null,
          {
            skipReferenceRecordExpansion: true,
          }
        )
        .first()
        .map(function(result) {
          return result.value;
        })
        .doOnError(done)
        .toArray()
        .doOnNext(function(results) {
          expect(results.length).to.equal(1);
          var actual = results[0];
          expect(actual.id).to.equal(
            'http://musicbrainz.org/artist/ba550d0e-adac-4864-b88b-407cab5e76af');
        })
        .doOnError(done)
        .subscribeOnCompleted(done);
      });

      it('should filter by @id when referenceRecord is in @graph format', function(done) {
        var expectedSource = Rx.Observable.fromNodeCallback(fs.readdir)(
            __dirname + '/input-data')
        .flatMap(Rx.Observable.from)
        .filter(function(name) {
          return name[0] !== '.' && name.slice(-7) === '.jsonld';
        })
        .filter(function(name) {
          return [
            'einstein.jsonld',
            'tyson.jsonld'
          ].indexOf(name) > -1;
        })
        .flatMap(function(name) {
          return Rx.Observable.fromNodeCallback(fs.readFile)(
              __dirname + '/input-data/' + name, {encoding: 'utf8'});
        })
        .map(JSON.parse)
        .concatMap(function(item) {
          var context = item['@context'];
          var frame = {
            '@context': context
          };
          frame['@id'] = 'http://dbpedia.org/resource/Neil_deGrasse_Tyson';
          return jsonldRx.frame(item, frame)
          .map(function(framed) {
            var element = framed['@graph'][0];
            var doc = {};
            doc['@context'] = context;
            _.assign(doc, element);
            return doc;
          });
        })
        .doOnError(done);

        var recordToMatch = {
          '@id': 'http://dbpedia.org/resource/Neil_deGrasse_Tyson',
          'givenName': 'Neil'
        };

        var options = {
          skipReferenceRecordExpansion: true,
        };

        var DBO = 'http://dbpedia.org/ontology/';
        var DBPEDIA = 'http://dbpedia.org/resource/';

        expectedSource
        .toArray()
        .subscribe(function(expectedList) {
          var expectedSorted = expectedList.sort(function(a, b) {
            return JSON.stringify(a) > JSON.stringify(b);
          });
          /*
          var expectedOut = JSON.stringify(expectedSorted, null, '  ');
          fs.writeFileSync('./expected.jsonld', expectedOut, {encoding: 'utf8'});
          //*/
          jsonldMatcher.filter(
            recordToMatch,
            referenceRecordsSource,
            null,
            options
          )
          .doOnError(done)
          .map(function(item) {
            return item.value;
          })
          .toArray()
          .doOnNext(function(actualList) {
            var actualSorted = actualList.sort(function(a, b) {
              return JSON.stringify(a) > JSON.stringify(b);
            });
            /*
            var actualOut = JSON.stringify(actualSorted, null, '  ');
            fs.writeFileSync('./actual.jsonld', actualOut, {encoding: 'utf8'});
            //*/
            expect(actualList.length).to.equal(2);
            expect(actualList[0]).to.not.equal(actualList[1]);
            expect(expectedList[0]).to.not.equal(expectedList[1]);
            expect(actualSorted).to.eql(expectedSorted);
          })
          .doOnError(done)
          .subscribeOnCompleted(done);
        }, console.error);
      });

      it('should filter by name when referenceRecord is in @graph format', function(done) {

        var expectedSource = Rx.Observable.fromNodeCallback(fs.readdir)(
            __dirname + '/input-data')
        .flatMap(Rx.Observable.from)
        .filter(function(name) {
          return name[0] !== '.' && name.slice(-7) === '.jsonld';
        })
        .filter(function(name) {
          return [
            //'einstein.jsonld',
            'tyson.jsonld'
          ].indexOf(name) > -1;
        })
        .flatMap(function(name) {
          return Rx.Observable.fromNodeCallback(fs.readFile)(
              __dirname + '/input-data/' + name, {encoding: 'utf8'});
        })
        .map(JSON.parse)
        .concatMap(function(item) {
          var context = item['@context'];
          var frame = {
            '@context': context
          };
          frame['http://xmlns.com/foaf/0.1/name'] = 'Neil deGrasse Tyson';
          return jsonldRx.frame(item, frame)
          .map(function(framed) {
            var element = framed['@graph'][0];
            var doc = {};
            doc['@context'] = context;
            _.assign(doc, element);
            return doc;
          });
        })
        .doOnError(done);

        var recordToMatch = {
          'http://xmlns.com/foaf/0.1/name': 'Neil deGrasse Tyson'
        };

        var matchers = [{
          characteristicKeys: [
            'http://schema.org/name',
            'http://xmlns.com/foaf/0.1/name',
          ],
          normalize: normalizeText,
          probabilityTruePositive: 0.8,
          probabilityFalsePositive: 0.03,
        }];

        var options = {
          skipReferenceRecordExpansion: true,
        };

        expectedSource
        .toArray()
        .subscribe(function(expectedList) {
          jsonldMatcher.filter(
            recordToMatch,
            referenceRecordsSource,
            matchers,
            options
          )
          .doOnError(done)
          .map(function(item) {
            return item.value;
          })
          .toArray()
          .doOnNext(function(actualList) {
            expect(actualList.length).to.equal(1);
            expect(actualList).to.eql(expectedList);
          })
          .doOnError(done)
          .subscribeOnCompleted(done);
        }, console.error);
      });
    });
  });

  describe('datasources.txt tests', function() {
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

    var datasourcesSource;

    before(function(done) {
      // load cached, pre-processed reference records
      var datasources = JSON.parse(fs.readFileSync(
          __dirname + '/expected-processed-datasources-many-matchers.jsonld',
          {encoding: 'utf8'}));
      datasourcesSource = Rx.Observable.from(datasources)
      .shareReplay();

      datasourcesSource
      .doOnError(done)
      .subscribeOnCompleted(done);
    });

    it('should filter by @id "urn:miriam:affy.probeset"', function(done) {
      var recordToMatch = {
        '@id': 'urn:miriam:affy.probeset'
      };

      var matchers = [{
        characteristicKeys: [
          '@id',
          DATASOURCES_URI_NS
        ],
        probabilityTruePositive: 0.999,
        probabilityFalsePositive: 0.05,
      }];

      var options = {
        skipReferenceRecordExpansion: true,
      };

      jsonldMatcher.filter(
        recordToMatch,
        datasourcesSource,
        matchers,
        options
      )
      .first()
      .map(function(result) {
        return result.value;
      })
      .doOnError(done)
      .toArray()
      .doOnNext(function(results) {
        expect(results.length).to.equal(1);
        var actual = results[0];
        expect(actual['system_code']).to.eql('X');
      })
      .doOnError(done)
      .subscribeOnCompleted(done);
    });

    it('should filter by RDF:about "urn:miriam:ncbigene"', function(done) {
      // This test is for RDF:about and also for the method "enhanceMatchers",
      // because the characteristicKeys listed below include "@id", but not
      // "http://www.w3.org/1999/02/22-rdf-syntax-ns#about"
      var recordToMatch = {
        'http://www.w3.org/1999/02/22-rdf-syntax-ns#about': 'urn:miriam:ncbigene'
      };

      var matchers = [{
        characteristicKeys: [
          '@id',
          DATASOURCES_URI_NS
        ],
        probabilityTruePositive: 1.0,
        probabilityFalsePositive: 0.05,
      }];

      var options = {
        skipReferenceRecordExpansion: true,
      };

      jsonldMatcher.filter(
        recordToMatch,
        datasourcesSource,
        matchers,
        options
      )
      .first()
      .map(function(result) {
        return result.value;
      })
      .doOnError(done)
      .toArray()
      .doOnNext(function(results) {
        expect(results.length).to.equal(1);
        var actual = results[0];
        expect(actual['system_code']).to.eql('L');
      })
      .doOnError(done)
      .subscribeOnCompleted(done);
    });

    it('should filter by calculated @id for http://identifiers.org/affy.probeset/', function(done) {

      var recordToMatch = {
        '@id': IDENTIFIERS + 'affy.probeset/'
      };

      var matchers = [{
        characteristicKeys: [
          '@id',
          DATASOURCES_URI_NS,
          convertMiriamUrnToIdentifiersIri,
          DATASOURCES_WEBSITE_URL_NS,
        ],
        probabilityTruePositive: 0.999,
        probabilityFalsePositive: 0.05,
      }];

      var options = {
        skipReferenceRecordExpansion: true,
      };

      jsonldMatcher.filter(
        recordToMatch,
        datasourcesSource,
        matchers,
        options
      )
      .first()
      .map(function(result) {
        return result.value;
      })
      .doOnError(done)
      .toArray()
      .doOnNext(function(results) {
        expect(results.length).to.equal(1);
        var actual = results[0];
        expect(actual.uri).to.eql('urn:miriam:affy.probeset');
      })
      .doOnError(done)
      .subscribeOnCompleted(done);
    });

    it('should filter by calculated @id for http://identifiers.org/ncbigene/', function(done) {
      var recordToMatch = {
        '@id': IDENTIFIERS + 'ncbigene/'
      };

      var matchers = [{
        characteristicKeys: [
          '@id',
          DATASOURCES_URI_NS,
          convertMiriamUrnToIdentifiersIri,
          DATASOURCES_WEBSITE_URL_NS,
        ],
        probabilityTruePositive: 0.999,
        probabilityFalsePositive: 0.05,
      }];

      var options = {
        skipReferenceRecordExpansion: true,
      };

      jsonldMatcher.filter(
        recordToMatch,
        datasourcesSource,
        matchers,
        options
      )
      .first()
      .map(function(result) {
        return result.value;
      })
      .doOnError(done)
      .toArray()
      .doOnNext(function(results) {
        expect(results.length).to.equal(1);
        var actual = results[0];
        expect(actual.uri).to.eql('urn:miriam:ncbigene');
      })
      .doOnError(done)
      .subscribeOnCompleted(done);
    });

    it('should filter by name: "Entrez Gene"', function(done) {
      var recordToMatch = {
        'http://schema.org/name': 'Entrez Gene'
      };

      var matchers = [{
        characteristicKeys: [
          'http://vocabularies.bridgedb.org/ops#datasource_name',
          'http://schema.org/name',
          'http://vocabularies.bridgedb.org/ops#official_name',
          getPreferredPrefixFromMiriamUrn,
          DATASOURCES_SYSTEM_CODE_NS
        ],
        probabilityTruePositive: 0.8,
        probabilityFalsePositive: 0.05,
      }];

      var options = {
        skipReferenceRecordExpansion: true,
      };

      jsonldMatcher.filter(
        recordToMatch,
        datasourcesSource,
        matchers,
        options
      )
      .first()
      .map(function(result) {
        return result.value;
      })
      .doOnError(done)
      .toArray()
      .doOnNext(function(results) {
        expect(results.length).to.equal(1);
        var actual = results[0];
        expect(actual.uri).to.eql('urn:miriam:ncbigene');
      })
      .doOnError(done)
      .subscribeOnCompleted(done);
    });

    it('should filter by regex', function(done) {
      var recordToMatch = {
        'http://vocabularies.bridgedb.org/ops#example_identifier': '1234'
      };

      var matchers = [{
        characteristicKeys: [
          BRIDGEDB + 'example_identifier',
          IDENTIFIERS + 'idot/exampleIdentifier',
        ],
        probabilityTruePositive: 0.8,
        probabilityFalsePositive: 0.05,
        tests: [
         function(referenceRecord, referenceRecordValue, recordToMatch, recordToMatchValue) {
           var reEntry = referenceRecord[DATASOURCES_REGEX_NS];
           if (reEntry && reEntry[0] && reEntry[0]['@value']) {
             var reString = reEntry[0]['@value'];
             var re = new RegExp(reString);
             return re.test(recordToMatchValue);
           }
         },
        ]
      }];

      var options = {
        skipReferenceRecordExpansion: true,
        threshold: 0.1,
      };

      jsonldMatcher.filter(
        recordToMatch,
        datasourcesSource,
        matchers,
        options
      )
      .first()
      .map(function(result) {
        return result.value;
      })
      .doOnError(done)
      .toArray()
      .doOnNext(function(results) {
        expect(results.length).to.equal(1);
        var actual = results[0];
        expect(actual['datasource_name']).to.eql('Affy');
      })
      .doOnError(done)
      .subscribeOnCompleted(done);
    });

    it('should filter all by regex', function(done) {
      var recordToMatch = {
        'http://vocabularies.bridgedb.org/ops#example_identifier': '1234'
      };

      var matchers = [{
        characteristicKeys: [
          BRIDGEDB + 'example_identifier',
          IDENTIFIERS + 'idot/exampleIdentifier',
        ],
        probabilityTruePositive: 0.8,
        probabilityFalsePositive: 0.05,
        tests: [
         function(referenceRecord, referenceRecordValue, recordToMatch, recordToMatchValue) {
           var reEntry = referenceRecord[DATASOURCES_REGEX_NS];
           if (reEntry && reEntry[0] && reEntry[0]['@value']) {
             var reString = reEntry[0]['@value'];
             var re = new RegExp(reString);
             return re.test(recordToMatchValue);
           }
         },
        ]
      }];

      var options = {
        skipReferenceRecordExpansion: true,
        threshold: 0.1,
      };

      var expected = [
        'Affy',
        // TODO BIND is missing an example identifier in datasources.txt
        //'BIND',
        'BioGrid',
        'BioSystems',
        'Chemspider',
        'dbSNP',
        'Ensembl Plants',
        'Entrez Gene',
        'Gene Wiki',
        'HGNC',
        'HGNC Accession number',
        'HomoloGene',
        'LipidBank',
        'NCBI Protein',
        'NCI Pathway Interaction Database',
        'Pathway Commons',
        'PDB',
        'PubChem-bioassay',
        'PubChem-compound',
        'PubChem-substance',
        'RGD',
        'STRING',
        'SubstrateDB',
        'SUPFAM',
        'SWISS-MODEL'
      ];

      jsonldMatcher.filter(
        recordToMatch,
        datasourcesSource,
        matchers,
        options
      )
      .doOnError(done)
      .map(function(item) {
        return item.value['datasource_name'];
      })
      .toArray()
      .doOnNext(function(results) {
        var actual = results;
        expect(actual).to.eql(expected);
      })
      .doOnError(done)
      .subscribeOnCompleted(done);
    });

    it('should filter all by regex and priority', function(done) {
      var recordToMatch = {
        'http://vocabularies.bridgedb.org/ops#example_identifier': '1234'
      };

      var matchers = [{
        characteristicKeys: [
          BRIDGEDB + 'example_identifier',
          IDENTIFIERS + 'idot/exampleIdentifier',
        ],
        probabilityTruePositive: 0.8,
        probabilityFalsePositive: 0.05,
        tests: [
         function(referenceRecord, referenceRecordValue, recordToMatch, recordToMatchValue) {
           var reEntry = referenceRecord[DATASOURCES_REGEX_NS];
           var priorityEntry = referenceRecord[BRIDGEDB + 'identifier_type'];
           if (priorityEntry && priorityEntry[0] && priorityEntry[0]['@value']) {
             var priorityValue = priorityEntry[0]['@value'];
             if (priorityValue === '1' && reEntry && reEntry[0] && reEntry[0]['@value']) {
               var reString = reEntry[0]['@value'];
               var re = new RegExp(reString);
               return re.test(recordToMatchValue);
             }
           }
         },
        ]
      }];

      var options = {
        skipReferenceRecordExpansion: true,
        threshold: 0.1,
      };

      var expected = [
        // TODO BIND is missing an example identifier in datasources.txt
        //'BIND',
        'BioGrid',
        'BioSystems',
        'Chemspider',
        'dbSNP',
        'Ensembl Plants',
        'Entrez Gene',
        'HGNC',
        'HGNC Accession number',
        'HomoloGene',
        'LipidBank',
        'NCBI Protein',
        'NCI Pathway Interaction Database',
        'Pathway Commons',
        'PubChem-compound',
        'PubChem-substance',
        'RGD',
        'STRING',
        'SUPFAM',
        'SWISS-MODEL'
      ];

      jsonldMatcher.filter(
        recordToMatch,
        datasourcesSource,
        matchers,
        options
      )
      .doOnError(done)
      .map(function(item) {
        return item.value['datasource_name'];
      })
      .toArray()
      .doOnNext(function(results) {
        var actual = results;
        expect(actual).to.eql(expected);
      })
      .doOnError(done)
      .subscribeOnCompleted(done);
    });

  });

  describe('GPML -> BridgeDb', function() {
    // TODO make sure, either here or in bridgedbjs, that we have tests for
    // the types of filters needed for the pvjs editor dropdowns.

    // NOTE must match the appropriate matchers in preprocess.js.
    var matchers = [{
      characteristicKeys: [
        BRIDGEDB + 'datasource_name'
      ],
      probabilityTruePositive: 0.9,
      probabilityFalsePositive: 0.05,
    }];

    var options = {
      skipReferenceRecordExpansion: true,
    };

    var datasourcesSource;
    before(function(done) {
      // load cached, pre-processed reference records
      var datasources = JSON.parse(fs.readFileSync(
          __dirname + '/expected-processed-datasources-for-gpml2bridgedb.jsonld',
          {encoding: 'utf8'}));
      datasourcesSource = Rx.Observable.from(datasources)
      .shareReplay();

      datasourcesSource
      .doOnError(done)
      .subscribeOnCompleted(done);
    });

    it('should convert datasource_name "Entrez Gene" to system_code "L"', function(done) {
      var recordToMatch = {
        'http://vocabularies.bridgedb.org/ops#datasource_name': 'Entrez Gene'
      };

      jsonldMatcher.filter(
        recordToMatch,
        datasourcesSource,
        matchers,
        options
      )
      .first()
      .map(function(result) {
        return result.value;
      })
      .doOnError(done)
      .toArray()
      .doOnNext(function(results) {
        expect(results.length).to.equal(1);
        var actual = results[0];
        expect(actual['system_code']).to.eql('L');
      })
      .doOnError(done)
      .subscribeOnCompleted(done);
    });

    it('should convert datasource_name "KNApSAcK" to system_code "Cks"', function(done) {
      var recordToMatch = {
        'http://vocabularies.bridgedb.org/ops#datasource_name': 'KNApSAcK'
      };

      jsonldMatcher.filter(
        recordToMatch,
        datasourcesSource,
        matchers,
        options
      )
      .first()
      .map(function(result) {
        return result.value;
      })
      .doOnError(done)
      .toArray()
      .doOnNext(function(results) {
        expect(results.length).to.equal(1);
        var actual = results[0];
        expect(actual['system_code']).to.eql('Cks');
      })
      .doOnError(done)
      .subscribeOnCompleted(done);
    });

  });

});

// TODO make a test where the matchers disagree
//      var matchers = [{
//        characteristicKeys: [
//          '@id',
//          DATASOURCES_URI_NS,
//          function(dataset) {
//            if (!!dataset[DATASOURCES_URI_NS] &&
//                dataset[DATASOURCES_URI_NS].indexOf('urn:miriam:') > -1) {
//              var miriamRootUrn = dataset[DATASOURCES_URI_NS];
//              var preferredPrefix = miriamRootUrn.substring(11, miriamRootUrn.length);
//              return IDENTIFIERS + preferredPrefix + '/';
//            }
//          },
//          DATASOURCES_WEBSITE_URL_NS,
//
//          // TODO is this worth checking?
//          //DATASOURCES_LINKOUT_PATTERN_NS,
//        ],
//        probabilityTruePositive: 0.7,
//        probabilityFalsePositive: 0.02,
//      }, {
//        characteristicKeys: [
//          'http://vocabularies.bridgedb.org/ops#datasource_name',
//          'http://schema.org/name',
//          'http://vocabularies.bridgedb.org/ops#official_name',
//          getPreferredPrefixFromMiriamUrn,
//          DATASOURCES_SYSTEM_CODE_NS
//        ],
//        probabilityTruePositive: 0.8,
//        probabilityFalsePositive: 0.05,
//      }];

      /*
      // TODO use something more like this for the API
      var distance = require('jaro-winkler');
      // TODO what about handling characteristics that actually indicate the same
      // thing but are nonetheless not supposed to be string matches?
      var matchers = {
        'http://vocabularies.bridgedb.org/ops#datasource_name': {
          // probability of this matcher indicating a match when the two
          // records are indeed a match.
          // can be a number or a function that returns a number. Range: (0,1)
          probabilityTruePositive: 0.95,
          // probability of this matcher indicating a match, by chance,
          // for two records that do NOT actually match.
          // can be a number or a function that returns a number. Range: (0,1)
          probabilityFalsePositive: 0.05,
          sameAs: [
            // can be a string or a function that returns a string.
            // if you specify a key here in sameAs, don't include it again as its own key entry.
            'http://schema.org/name',
            'http://vocabularies.bridgedb.org/ops#official_name',
            getPreferredPrefixFromMiriamUrn,
            DATASOURCES_SYSTEM_CODE_NS
          ],
          // TODO we're handling sameAs for keys. What about for values? For example, we
          // can say http://schema.org/name is the sameAs foaf:name, but what about
          // entrez gene 1234 being the sameAs ensembl ENS23453245?
          // specify the type of normalization to perform on the value of this property,
          // such as URI normalization, ignore case (set to lowercase), alphanumeric only, etc.
          normalize: function(value) {
            return value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
          },
          tests: [
          // if there is not a match based on the (normalized?) record values, then
          // we run each test provided below to see whether we have a match.
          // TODO include examples of how to use fuzzy string matching like
          // Jaro-Winkler distance:
          // https://www.npmjs.com/package/jaro-winkler
          // or a phonetic algorithm like this one:
          // https://www.npmjs.com/package/nysiis-phonetics
          // TODO in jsonld-matcher-rx.js, we need to pass in the same args
          // for every test function.
          // We also need to consider that the values may come from a sameAs function.
//            @param {object} recordToMatch the record for which to find a match in the set of
//                                  reference records
//            @param {object[]} recordToMatchValues value(s) from the record for which to find a
//                                          match in the set of reference records like
//                                          [{'@id': '...'}] or [{'@value': '...'}]
//            @param {object} referenceRecord e.g, JSON-LD expanded row of the dataset based on
//                                            datasources.txt and datasources_headers.txt
//            @param {object[]} referenceRecordValues value(s) like [{'@id': '...'}] or
//                                                    [{'@value': '...'}]
//            @return {boolean} whether the current referenceRecord matches the recordToMatch
            function(recordToMatch, recordToMatchValues, referenceRecord,
                referenceRecordValues) {
              return referenceRecordValues.find(function(referenceRecordValue) {
                var referenceRecordString = referenceRecordValue['@value'];
                return recordToMatchValues.find(function(recordToMatchValue) {
                  var recordToMatchString = recordToMatchValue['@value'];
                  return distance(referenceRecordString, recordToMatchString) > 0.8;
                });
              });
            },
          ]
        },
        'http://vocabularies.bridgedb.org/ops#example_identifier': {
          sameAs: [
            IDENTIFIERS + 'idot/exampleIdentifier',
          ],
          tests: [
            function(recordToMatch, recordToMatchValues, referenceRecord,
                referenceRecordValues) {
              var reEntry = referenceRecord[DATASOURCES_REGEX_NS];
              if (reEntry && reEntry[0] && reEntry[0]['@value']) {
                var reString = reEntry[0]['@value'];
                var re = new RegExp(reString);
                if (recordToMatchValues[0] && recordToMatchValues[0]['@value']) {
                  return recordToMatchValues.find(function(recordToMatchValue) {
                    var targetValue = recordToMatchValue['@value'];
                    return re.test(targetValue);
                  });
                }
              }
            },
          ]
        },
      };

      var options = {
        skipReferenceRecordExpansion: true,
        threshold: 4.5,
        // Allow a user to specify a matcher or combination of matchers that must be met to
        // indicate a match.
        // If "combinations" is not specified, that means each matcher provided can, on its own,
        // definitely recognize a match. So we can safely return the first match, knowning its
        // also the best and only match.
        // But if "combinations" is specified, we need to figure out how to handle weights and
        // findFirst vs. findBest vs. filter for the API.
        // We might be able to ignore "combinations" initially and add it in a later version.
        combinations: [{
          // for weight, see u vs. m:
          // https://en.wikipedia.org/wiki/Record_linkage#Probabilistic_record_linkage
          //
          // u: probability of an identifier match, based on chance, for 2 non-matching records
          // m: probability of an identifier match in the case of an actual match
          // function getMatchWeight(m, u) {
          //   return Math.log(m/u)/Math.log(2);
          // }
          //
          // function getNonMatchWeight(m, u) {
          //   return Math.log((1 - m)/(1 - u))/Math.log(2);
          // }
          //
          // let's try to match the following two database records:
          // Name         Example Identifier  Regex
          // Entrez Gene  1234                /^\d+$/
          // NCBI Gene    8421                /^\d+$/
          //
          // name
          // u ≈ 1 / total possible number of different normalized names
          //   ≈ 1/500 (500 is a quick guess for all databases)
          // m ≈ 1 / total number of different normalized names for a specific database
          //   ≈ 1/10 (10 is a quick guess for Entrez Gene)
          //
          // match weight ≈ getMatchWeight(1/10, 1/500)
          //              ≈ 5.64
          // non-match weight ≈ getNonMatchWeight(1/10, 1/500)
          //                  ≈ -0.15
          //
          // example identifier regex match
          // u ≈ 1 / total number of reference records that pass that regex
          //   ≈ 1/15 (15 is a quick guess for Entrez Gene)
          // m ≈ 0.999
          // match weight ≈ getMatchWeight(0.999, 1/15)
          //              ≈ 3.91
          // non-match weight ≈ getNonMatchWeight(0.999, 1/15)
          //                  ≈ -9.87
          //
          // the names don't match but the example identifier regex does.
          //
          // sum of properties = -0.15 + 3.91
          //                   = 3.76
          //
          // for the following two database records:
          // Name         Example Identifier  Regex
          // Entrez Gene  1234                /^\d+$/
          // entrez gene  8421                /^\d+$/
          //
          // Both the names and example-identifier-regexes indicate matches,
          // giving a threshold value of 5.64 + 3.76 = 9.40
          //
          // The above analysis makes sense for identifying just a database, but what if we
          // wanted to match two DataNode records based on DB and identifier? A match for
          // both DB and identifier would indicate a definite match. But taking the
          // probabilities
          // for each property independently, the probability of identifying a gene based
          // on just DB would be low, and the probability of identifying based on
          // just identifier could also be low. So would the resulting threshold value be
          // correct?
          // It seems that the combined probability would not take into account the importance
          // of the relationship between a match for DB and a match for identifier.
          //
          // let's try to match the following two DataNodes
          // Name         Identifier Type
          // Entrez Gene  1234       Gene
          // entrez gene  1234       Gene
          //
          // name:
          // u ≈ BridgeDb Entrez Gene record count / total BridgeDb record count
          //   ≈ 24485 / 1e6 (est.)
          // m ≈ 1 / total number of different normalized names for a specific database
          //   ≈ 1/10 (for Entrez Gene)
          // match weight = 2.03
          // non-match weight = -0.12
          //
          // identifier
          // u ≈ total number of reference records with value 1234 /
          //         total BridgeDb record count
          //   ≈ 15 / 1e6 (numbers are a quick guess)
          // m ≈ 0.999
          // match weight = 16.02
          // non-match weight = -9.97
          //
          // So we get a threshold of 18.05, which seems pretty high, but is it
          // as high as it actually should be?
          //
          // Should we somehow separate out characteristics that produce the same
          // information? Imagine a scenario where we have
          // a type field that reduces the possible matches from 1e6 to to 15k
          // and a DB identifier that does the same, because it is the only DB
          // with identifiers of that type. Then a match of DB is not much
          // improved by also getting a match on type, because it's essentially
          // two ways of saying the same thing.
          //
          weight: 1,
          matchers: [
            '@id',
          ],
        }, {
          weight: 0.9,
          matchers: [
            'http://vocabularies.bridgedb.org/ops#example_identifier',
            'http://vocabularies.bridgedb.org/ops#PLUS_SOMETHING_ELSE',
          ],
        }, {
          weight: 0.3,
          matchers: [
            'http://vocabularies.bridgedb.org/ops#example_identifier',
          ],
        }],
      };

      jsonldMatcher.filter(
        recordToMatch,
        datasourcesSource,
        matchers,
        options
      )
      .first()
      .map(function(result) {
        return result.value;
      })
      ...
      //*/

        /*
        var matchers = {
          'http://vocabularies.bridgedb.org/ops#datasource_name': {
            // probability of this matcher indicating a match when the two
            // records are indeed a match.
            // can be a number or a function that returns a number. Range: (0,1)
            probabilityTruePositive: 0.95,
            // probability of this matcher indicating a match, by chance,
            // for two records that do NOT actually match.
            // can be a number or a function that returns a number. Range: (0,1)
            probabilityFalsePositive: 0.05,
            sameAs: [
              // can be a string or a function that returns a string.
              // if you specify a key here in sameAs, don't include it again as its own key entry.
              'http://schema.org/name',
              'http://vocabularies.bridgedb.org/ops#official_name',
              getPreferredPrefixFromMiriamUrn,
              DATASOURCES_SYSTEM_CODE_NS
            ],
            // TODO we're handling sameAs for keys. What about for values? For example, we
            // can say http://schema.org/name is the sameAs foaf:name, but what about
            // entrez gene 1234 being the sameAs ensembl ENS23453245?
            // specify the type of normalization to perform on the value of this property,
            // such as URI normalization, ignore case (set to lowercase), alphanumeric only, etc.
            normalize: function(value) {
              return value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
            },
            tests: [
            // if there is not a match based on the (normalized?) record values, then
            // we run each test provided below to see whether we have a match.
            // TODO include examples of how to use fuzzy string matching like
            // Jaro-Winkler distance:
            // https://www.npmjs.com/package/jaro-winkler
            // or a phonetic algorithm like this one:
            // https://www.npmjs.com/package/nysiis-phonetics
            // TODO in jsonld-matcher-rx.js, we need to pass in the same args
            // for every test function.
            // We also need to consider that the values may come from a sameAs function.
  //            @param {object} recordToMatch the record for which to find a match in the set of
  //                                  reference records
  //            @param {object[]} recordToMatchValues value(s) from the record for which to find a
  //                                          match in the set of reference records like
  //                                          [{'@id': '...'}] or [{'@value': '...'}]
  //            @param {object} referenceRecord e.g, JSON-LD expanded row of the dataset based on
  //                                            datasources.txt and datasources_headers.txt
  //            @param {object[]} referenceRecordValues value(s) like [{'@id': '...'}] or
  //                                                    [{'@value': '...'}]
  //            @return {boolean} whether the current referenceRecord matches the recordToMatch
              function(recordToMatch, recordToMatchValues,
                  referenceRecord, referenceRecordValues) {
                return referenceRecordValues.find(function(referenceRecordValue) {
                  var referenceRecordString = referenceRecordValue['@value'];
                  return recordToMatchValues.find(function(recordToMatchValue) {
                    var recordToMatchString = recordToMatchValue['@value'];
                    return distance(referenceRecordString, recordToMatchString) > 0.8;
                  });
                });
              },
            ]
          },
          'http://vocabularies.bridgedb.org/ops#example_identifier': {
            sameAs: [
              IDENTIFIERS + 'idot/exampleIdentifier',
            ],
            tests: [
              function(recordToMatch, recordToMatchValues,
                  referenceRecord, referenceRecordValues) {
                var reEntry = referenceRecord[DATASOURCES_REGEX_NS];
                if (reEntry && reEntry[0] && reEntry[0]['@value']) {
                  var reString = reEntry[0]['@value'];
                  var re = new RegExp(reString);
                  if (recordToMatchValues[0] && recordToMatchValues[0]['@value']) {
                    return recordToMatchValues.find(function(recordToMatchValue) {
                      var targetValue = recordToMatchValue['@value'];
                      return re.test(targetValue);
                    });
                  }
                }
              },
            ]
          },
        };
        //*/