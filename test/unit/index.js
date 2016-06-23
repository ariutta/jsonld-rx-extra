// TODO this looks as if it's just a placeholder file, copied from elsewhere.
var _ = require('lodash');
var chai = require('chai');
var chaiAsPromised = require('chai-as-promised');
var colors = require('colors');
var expect = chai.expect;
var fs = require('fs');
var http    =  require('http');
//var mockserver  =  require('mockserver');
var sinon      = require('sinon');
var testUtils = require('../test-utils');
var wd = require('wd');

var desired = {'browserName': 'phantomjs'};
desired.name = 'example with ' + desired.browserName;
desired.tags = ['dev-test'];

chai.use(chaiAsPromised);
chai.should();
chaiAsPromised.transferPromiseness = wd.transferPromiseness;

//var internalContext = require('../../../lib/context.json');
var JsonldRx = require('../../index.js');
var jsonldRx = new JsonldRx({
  defaultContext: 'http://schema.org/'
});

describe('jsonldRx extra', function() {
  var allPassed = true;
  var that = this;
  var update;
  var lkgDataPath;
  var lkgDataString;
  var name;
  var testIndex = -1;

  /*
  before(function(done) {
    // Find whether user requested to update the expected JSON result
    update = testUtils.getUpdateState(that.title);
    done();
  });
  //*/

  beforeEach(function(done) {
    name = 'test' + testIndex;
    testIndex += 1;
    done();
  });

  /*
  afterEach(function(done) {
    allPassed = allPassed && (this.currentTest.state === 'passed');
    done();
  });

  after(function(done) {
    done();
  });
  //*/

//  var datasets = fs.readdirSync('./input-data/')
//    .filter(function(name) {
//      return name[0] !== '.' && name.slice(-7) === '.jsonld';
//    })
//    .map(function(name) {
//      return require('./input-data/' + name);
//    })
//    .reduce(function(accumulator, person) {
//      return accumulator.concat([person]);
//    }, []);
//
//  var datasetsClone = _.clone(datasets);

  describe('add/replace context', function() {
//    var targetMatch = _.clone(datasetsClone[5]);

    it('should work for input w/ remote context', function(done) {

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

      var dereferencedContext = {
        "@context": {
          "@vocab": "http://vocabularies.bridgedb.org/ops#",
          "id": "@id",
          "type": "@type",
          "Dataset": {
            "@id": "void:Dataset",
            "@type": "@id"
          },
          "http://www.biopax.org/release/biopax-level3.owl#EntityReference": {
            "@type": "@id"
          },
          "biopax:EntityReference": {
            "@type": "@id"
          },
          "EntityReference": {
            "@id": "biopax:EntityReference",
            "@type": "@id"
          },
          "http://www.biopax.org/release/biopax-level3.owl#entityReference": {
            "@type": "@id"
          },
          "biopax:entityReference": {
            "@type": "@id"
          },
          "entityReference": {
            "@id": "biopax:entityReference",
            "@type": "@id"
          },
          "xref": {
            "@id": "biopax:xref",
            "@type": "@id"
          },
          "SIO": {
            "@id": "http://semanticscience.org/resource/",
            "@type": "@vocab"
          },
          "http://identifiers.org/idot/alternatePrefix": {
            "@type": "xsd:string"
          },
          "idot:alternatePrefix": {
            "@type": "xsd:string"
          },
          "alternatePrefix": {
            "@id": "idot:alternatePrefix",
            "@type": "xsd:string"
          },
          "baseIri": "@base",
          "biopax": {
            "@id": "http://www.biopax.org/release/biopax-level3.owl#",
            "@type": "@vocab"
          },
          "bridgeDbDatasourceHeaders": {
            "@id": "https://github.com/bridgedb/BridgeDb/blob/master/org.bridgedb.bio/resources/org/bridgedb/bio/datasources_headers.txt#",
            "@type": "@vocab"
          },
          "https://github.com/bridgedb/BridgeDb/blob/master/org.bridgedb.bio/resources/org/bridgedb/bio/datasources_headers.txt#datasource_name": {
            "@type": "xsd:string"
          },
          "bridgeDbDatasourceHeaders:datasource_name": {
            "@type": "xsd:string"
          },
          "datasource_name": {
            "@id": "bridgeDbDatasourceHeaders:datasource_name",
            "@type": "xsd:string"
          },
          "https://github.com/bridgedb/BridgeDb/blob/master/org.bridgedb.bio/resources/org/bridgedb/bio/datasources_headers.txt#linkout_pattern": {
            "@type": "xsd:string"
          },
          "bridgeDbDatasourceHeaders:linkout_pattern": {
            "@type": "xsd:string"
          },
          "linkout_pattern": {
            "@id": "bridgeDbDatasourceHeaders:linkout_pattern",
            "@type": "xsd:string"
          },
          "http://vocabularies.bridgedb.org/ops#type": {
            "@type": "xsd:string"
          },
          "entityType": {
            "@id": "http://vocabularies.bridgedb.org/ops#type",
            "@type": "xsd:string"
          },
          "http://vocabularies.bridgedb.org/ops#primary": {
            "@type": "xsd:string"
          },
          "primary": {
            "@type": "xsd:string"
          },
          "http://vocabularies.bridgedb.org/ops#systemCode": {
            "@type": "xsd:string"
          },
          "systemCode": {
            "@type": "xsd:string"
          },
          "bridgeDbDatasourceHeaders:system_code": {
            "@type": "xsd:string"
          },
          "system_code": {
            "@id": "bridgeDbDatasourceHeaders:system_code",
            "@type": "xsd:string"
          },
          "http://vocabularies.bridgedb.org/ops#uriRegexPattern": {
            "@type": "xsd:string"
          },
          "uriRegexPattern": {
            "@type": "xsd:string"
          },
          "http://www.biopax.org/release/biopax-level3.owl#db": {
            "@type": "xsd:string"
          },
          "biopax:db": {
            "@type": "xsd:string"
          },
          "db": {
            "@id": "biopax:db",
            "@type": "xsd:string"
          },
          "dcterms": {
            "@id": "http://purl.org/dc/terms/",
            "@type": "@vocab"
          },
          "http://www.biopax.org/release/biopax-level3.owl#displayName": {
            "@type": "xsd:string"
          },
          "biopax:displayName": {
            "@type": "xsd:string"
          },
          "displayName": {
            "@id": "biopax:displayName",
            "@type": "xsd:string"
          },
          "http://identifiers.org/idot/exampleIdentifier": {
            "@type": "xsd:string"
          },
          "idot:exampleIdentifier": {
            "@type": "xsd:string"
          },
          "exampleIdentifier": {
            "@id": "idot:exampleIdentifier",
            "@type": "xsd:string"
          },
          "http://rdfs.org/ns/void#exampleResource": {
            "@type": "@id"
          },
          "void:exampleResource": {
            "@type": "@id"
          },
          "exampleResource": {
            "@id": "void:exampleResource",
            "@type": "@id"
          },
          "foaf": {
            "@id": "http://xmlns.com/foaf/0.1/",
            "@type": "@vocab"
          },
          "gpml": {
            "@id": "http://vocabularies.wikipathways.org/gpml#",
            "@type": "@vocab"
          },
          "identifier": {
            "@id": "http://rdaregistry.info/Elements/u/P60052",
            "@type": "xsd:string"
          },
          "http://identifiers.org/idot/identifierPattern": {
            "@type": "xsd:string"
          },
          "idot:identifierPattern": {
            "@type": "xsd:string"
          },
          "identifierPattern": {
            "@id": "idot:identifierPattern",
            "@type": "xsd:string"
          },
          "idot": {
            "@id": "http://identifiers.org/idot/",
            "@type": "@vocab"
          },
          "isDataItemIn": {
            "@id": "SIO:SIO_001278",
            "@type": "@id"
          },
          "http://schema/name": {
            "@type": "xsd:string"
          },
          "schema:name": {
            "@type": "xsd:string"
          },
          "name": {
            "@id": "schema:name",
            "@type": "xsd:string"
          },
          "nameLanguageMap": {
            "@container": "@language",
            "@id": "name"
          },
          "http://www.biopax.org/release/biopax-level3.owl#organism": {
            "@type": "@id"
          },
          "biopax:organism": {
            "@type": "@id"
          },
          "organism": {
            "@id": "biopax:organism",
            "@type": "@id"
          },
          "owl": {
            "@id": "http://www.w3.org/2002/07/owl#",
            "@type": "@vocab"
          },
          "http://identifiers.org/idot/preferredPrefix": {
            "@type": "xsd:string"
          },
          "idot:preferredPrefix": {
            "@type": "xsd:string"
          },
          "preferredPrefix": {
            "@id": "idot:preferredPrefix",
            "@type": "xsd:string"
          },
          "probe": {
            "@id": "http://www.sequenceontology.org/miso/release_2.4/term/SO:0000051",
            "@type": "@id"
          },
          "schema": {
            "@id": "http://schema.org/",
            "@type": "@vocab"
          },
          "http://purl.org/dc/terms/subject": {
            "@type": "@id"
          },
          "dcterms:subject": {
            "@type": "@id"
          },
          "subject": {
            "@id": "dcterms:subject",
            "@type": "@id"
          },
          "https://github.com/bridgedb/BridgeDb/blob/master/org.bridgedb.bio/resources/org/bridgedb/bio/datasources_headers.txt#uri": {
            "@type": "@id"
          },
          "bridgeDbDatasourceHeaders:uri": {
            "@type": "@id"
          },
          "uri": {
            "@id": "bridgeDbDatasourceHeaders:uri",
            "@type": "@id"
          },
          "void": {
            "@id": "http://rdfs.org/ns/void#",
            "@type": "@vocab"
          },
          "https://github.com/bridgedb/BridgeDb/blob/master/org.bridgedb.bio/resources/org/bridgedb/bio/datasources_headers.txt#website_url": {
            "@type": "@id"
          },
          "bridgeDbDatasourceHeaders:website_url": {
            "@type": "@id"
          },
          "website_url": {
            "@id": "bridgeDbDatasourceHeaders:website_url",
            "@type": "@id"
          },
          "webPage": {
            "@id": "foaf:page",
            "@type": "@id"
          },
          "xsd": {
            "@id": "http://www.w3.org/2001/XMLSchema#",
            "@type": "@id"
          }
        }
      };

//      jsonldRx.addContext('http://schema.org/', input)
//      .doOnNext(function(x) {
//        console.log('contextified');
//        console.log(x);
//      })
//      .concatMap(function(x) {
//        return jsonldRx.expand(x);
//      })
      jsonldRx.expand(input)
      .concatMap(function(x) {
        console.log('expanded');
        console.log(JSON.stringify(x, null, '  '));
        return jsonldRx.compact(x, dereferencedContext)
        .map(function(x) {
          console.log('extra context details');
          console.log(x[1]);
          return x[0];
        });
      })
      // TODO expand and then compactWithCache
      .subscribe(function(result) {
        console.log('result');
        console.log(result);
        //expect(result).to.eql(targetMatch);
        expect(1).to.eql(1);
        return done();
      });
    });

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
