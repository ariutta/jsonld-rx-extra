// TODO this looks as if it's just a placeholder file, copied from elsewhere.
var _ = require('lodash');
var chai = require('chai');
var chaiAsPromised = require('chai-as-promised');
var dereferencedContext = require('../input-data/dereferenced-context.json');
var expect = chai.expect;
var sinon      = require('sinon');
var testHelpers = require('test-helpers');
var wd = require('wd');

var handleResult = testHelpers.handleResult;

var desired = {'browserName': 'phantomjs'};
desired.name = 'example with ' + desired.browserName;
desired.tags = ['dev-test'];

chai.use(chaiAsPromised);
chai.should();
chaiAsPromised.transferPromiseness = wd.transferPromiseness;

//var internalContext = require('../../../lib/context.json');
var JsonldRx = require('../../index.js');
var jsonldRx = new JsonldRx({
  transformerContext: 'http://schema.org/'
});

describe('jsonldRx extra', function() {
  var allPassed = true;
  var that = this;
  var name;
  var testIndex = -1;

  beforeEach(function(done) {
    name = 'test' + testIndex;
    testIndex += 1;
    done();
  });

  describe('transform input and return output w/ appropriate context', function() {
    function setBirthPlace(person, inputContext) {
      if (!person['@context']) {
        person['@context'] = inputContext;
      }
      // transformerContext
      var transformerContext = 'http://schema.org/';

      var jsonldRx = new JsonldRx({
        transformerContext: transformerContext
      });

      return jsonldRx.toTransformerContext(person)
      .map(function(person) {
        person[0]['http://schema.org/birthPlace'] = 'London, United Kingdom';
        //person[c.birthPlace] = 'London, United Kingdom';
        return person;
      })
      .concatMap(jsonldRx.toExternalContext);
    }

    it('should work for input w/ local context', function(done) {
      var testCoordinator = this;
      var test = this.test;
      test.expectedPath = __dirname + '/ada-lovelace.jsonld';
//      test.expected = {
//        '@context': {
//          called: 'http://schema.org/name',
//          birthPlace: 'http://schema.org/birthPlace',
//        },
//        called: 'Ada Lovelace',
//        birthPlace: 'London, United Kingdom'
//      };

      var input = {
        '@context': {
          called: 'http://schema.org/name',
        },
        '@id': 'http://dbpedia.org/page/Ada_Lovelace',
        called: 'Ada Lovelace'
      };

      setBirthPlace(input)
      .last()
      .let(handleResult.bind(testCoordinator))
      .doOnError(done)
      .subscribeOnCompleted(done);
    });
  });


  describe('add/replace context', function() {
    it('should expand input w/ remote context', function(done) {
      var testCoordinator = this;
      var test = this.test;
      test.expectedPath = __dirname + '/expanded-entity-reference.jsonld';

      var context = [
        'https://cdn.rawgit.com/bridgedb/BridgeDb/',
        'f12e2dad69ef5d5097bfbe2ef201fd576c3bdcc3',
        '/org.bridgedb.rdf/resources/jsonld-context.jsonld'
      ].join('');

      var input = {
        '@context': context,
        '@id': 'http://identifiers.org/ncbigene/1234',
        'name': 'C-C motif chemokine receptor 5',
        'type': ['EntityReference']
      };


      jsonldRx.expand(input)
      .last()
      .let(handleResult.bind(testCoordinator))
      .doOnError(done)
      .subscribeOnCompleted(done);
    });

    it('should work for input w/ remote context', function(done) {
      var testCoordinator = this;
      var test = this.test;
      test.expectedPath = __dirname + '/entity-reference-expanded-compacted.jsonld';

      var context = [
        'https://cdn.rawgit.com/bridgedb/BridgeDb/',
        'f12e2dad69ef5d5097bfbe2ef201fd576c3bdcc3',
        '/org.bridgedb.rdf/resources/jsonld-context.jsonld'
      ].join('');

      var input = {
        '@context': context,
        '@id': 'http://identifiers.org/ncbigene/1234',
        'name': 'C-C motif chemokine receptor 5',
        'type': ['EntityReference']
      };

      jsonldRx.expand(input)
      .concatMap(function(x) {
        return jsonldRx.compact(x, dereferencedContext)
        .map(function(x) {
          return x[0];
        });
      })
      .last()
      .let(handleResult.bind(testCoordinator))
      .doOnError(done)
      .subscribeOnCompleted(done);
    });

//    it('should work for input w/ remote context, compacting using cache', function(done) {
//      var testCoordinator = this;
//      var test = this.test;
//      test.expectedPath = __dirname + '/entity-reference-expanded-compacted-with-cache.jsonld';
//
//      var context = [
//        'https://cdn.rawgit.com/bridgedb/BridgeDb/',
//        'f12e2dad69ef5d5097bfbe2ef201fd576c3bdcc3',
//        '/org.bridgedb.rdf/resources/jsonld-context.jsonld'
//      ].join('');
//
//      var input = {
//        '@context': context,
//        '@id': 'http://identifiers.org/ncbigene/1234',
//        'name': 'C-C motif chemokine receptor 5',
//        'type': ['EntityReference']
//      };
//
//      // TODO compactWithCache appears to not yet be written
//      jsonldRx.expand(input)
//      .concatMap(function(x) {
//        return jsonldRx.compactWithCache(x, dereferencedContext)
//        .map(function(x) {
//          return x[0];
//        });
//      })
//      .last()
//      .let(handleResult.bind(testCoordinator))
//      .doOnError(done)
//      .subscribeOnCompleted(done);
//    });

//    it('should work for input w/ default schema.org context', function(done) {
//      var testCoordinator = this;
//      var test = this.test;
//      test.expectedPath = __dirname + '/entity-reference-expanded-compacted-schema.jsonld';
//
//      var input = {
//        '@id': 'http://identifiers.org/ncbigene/1234',
//        'name': 'C-C motif chemokine receptor 5',
//        'type': ['EntityReference']
//      };
//
//      jsonldRx.addContext('http://schema.org/', input)
//      .concatMap(function(x) {
//        return jsonldRx.expand(x);
//      })
//      .concatMap(function(x) {
//        console.log('expanded');
//        console.log(JSON.stringify(x, null, '  '));
//        return jsonldRx.compact(x, 'http://schema.org/')
//        .map(function(x) {
//          console.log('extra context details');
//          console.log(x[1]);
//          return x[0];
//        });
//      })
//      .last()
//      .let(handleResult.bind(testCoordinator))
//      .doOnError(done)
//      .subscribeOnCompleted(done);
//    });

//    it('should work for input w/ no context', function(done) {
//
//      var input = {
//        '@context': 'http://schema.org/',
//        '@id': 'http://musicbrainz.org/artist/ba550d0e-adac-4864-b88b-407cab5e76af',
//        'name': 'Paul McCartney',
//        'profession': 'artist'
//      };
//
//      var input = {
//        '@id': 'http://musicbrainz.org/artist/ba550d0e-adac-4864-b88b-407cab5e76af',
//        'name': 'Paul McCartney',
//        'profession': 'artist'
//      };
//
//      jsonldRx.addContext('http://schema.org/', input)
//      .doOnNext(function(x) {
//        console.log('contextified');
//        console.log(x);
//      })
//      .concatMap(function(x) {
//        return jsonldRx.expand(x);
//      })
//      .concatMap(function(x) {
//        return jsonldRx.compact(x, {'@vocab': 'http://schema.org/'})
//        .map(function(x) {
//          console.log('extra context details');
//          console.log(x[1]);
//          return x[0];
//        });
//      })
//      // TODO expand and then compactWithCache
//      .subscribe(function(result) {
//        console.log('result');
//        console.log(result);
//        //expect(result).to.eql(targetMatch);
//        expect(1).to.eql(1);
//        return done();
//      });
//    });

  });

  /*
  describe('simple object', function() {
    var targetMatch = _.clone(datasetsClone[5]);

    it('should match by @id', function(done) {

      var args = {
        '@id': 'http://musicbrainz.org/artist/ba550d0e-adac-4864-b88b-407cab5e76af'
      };

      var dataStream = highland(datasets);

      var selectedKeys = ['@id', 'name'];

      jsonldMatcher.tieredFind(
        args,
        dataStream,
        name,
        selectedKeys
      )
      .last()
      .each(function(result) {
        expect(result).to.eql(targetMatch);
        return done();
      });
    });

    it('should match by @id with conflicting profession property', function(done) {

      var args = {
        '@id': 'http://musicbrainz.org/artist/ba550d0e-adac-4864-b88b-407cab5e76af',
        'name': 'Paul McCartney',
        'profession': 'artist'
      };

      var dataStream = highland(datasets);

      var selectedKeys = ['@id', 'name'];

      var alternateFilters = [
        function(candidate) {
          return candidate === 'wee';
        }
      ];

      jsonldMatcher.tieredFind(
        args,
        dataStream,
        name,
        selectedKeys,
        alternateFilters
      )
      .last()
      .each(function(result) {
        expect(result).to.eql(targetMatch);
        return done();
      });
    });

    it('should match by name', function(done) {

      var args = {
        '@id': 'http://dbpedia.org/resource/Paul_McCartney',
        'name': 'Paul McCartney'
      };

      var dataStream = highland(datasets);

      var selectedKeys = ['@id', 'name'];

      var alternateFilters = [
        function(candidate) {
          return candidate === 'wee';
        }
      ];

      jsonldMatcher.tieredFind(
        args,
        dataStream,
        name,
        selectedKeys,
        alternateFilters
      )
      .last()
      .each(function(result) {
        expect(result).to.eql(targetMatch);
        return done();
      });
    });

    it('should match by owl:sameAs (string)', function(done) {
      var args = {
        '@id': 'http://dbpedia.org/resource/Paul_McCartney',
        'owl:sameAs': 'http://musicbrainz.org/artist/ba550d0e-adac-4864-b88b-407cab5e76af',
        'givenName': 'Paul'
      };

      var dataStream = highland(datasets);

      var selectedKeys = ['@id', 'name'];

      jsonldMatcher.tieredFind(
        args,
        dataStream,
        name,
        selectedKeys
      )
      .last()
      .each(function(result) {
        expect(result).to.eql(targetMatch);
        return done();
      });
    });

    it('should match by owl:sameAs (array)', function(done) {

      var args = {
        '@id': 'http://dbpedia.org/resource/Paul_McCartney',
        'owl:sameAs': ['http://musicbrainz.org/artist/ba550d0e-adac-4864-b88b-407cab5e76af'],
        'givenName': 'Paul'
      };

      var dataStream = highland(datasets);

      var selectedKeys = ['@id', 'name'];

      var alternateFilters = [
        function(candidate) {
          return candidate === 'wee';
        }
      ];

      jsonldMatcher.tieredFind(
        args,
        dataStream,
        name,
        selectedKeys,
        alternateFilters
      )
      .last()
      .each(function(result) {
        expect(result).to.eql(targetMatch);
        return done();
      });
    });

   });
  //*/

});
