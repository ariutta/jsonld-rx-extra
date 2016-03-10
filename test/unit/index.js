require('require-jsonld');

var _ = require('lodash');
var BridgeDb = require('../../../index.js');
var chai = require('chai');
var chaiAsPromised = require('chai-as-promised');
var colors = require('colors');
var expect = chai.expect;
var fs = require('fs');
var highland = require('highland');
var http    =  require('http');
var mockserver  =  require('mockserver');
var run = require('gulp-run');
var sinon      = require('sinon');
var testUtils = require('../../test-utils');
var wd = require('wd');

var desired = {'browserName': 'phantomjs'};
desired.name = 'example with ' + desired.browserName;
desired.tags = ['dev-test'];

chai.use(chaiAsPromised);
chai.should();
chaiAsPromised.transferPromiseness = wd.transferPromiseness;

var internalContext = require('../../../lib/context.json');
var JsonldMatcher = require('../../../lib/jsonld-matcher.js');
var JsonldRx = require('jsonld-rx');
var jsonldRx = new JsonldRx({
  defaultContext: internalContext
});
var jsonldMatcher = jsonldRx._matcher = new JsonldMatcher(jsonldRx);

describe('BridgeDb.Dataset.query', function() {
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

  var datasets = fs.readdirSync('./input-data/')
    .filter(function(name) {
      return name[0] !== '.' && name.slice(-7) === '.jsonld';
    })
    .map(function(name) {
      return require('./input-data/' + name);
    })
    .reduce(function(accumulator, person) {
      return accumulator.concat([person]);
    }, []);

  var datasetsClone = _.clone(datasets);

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

    /* TODO this fails
    it('should match a compacted JSON-LD document by @id (base)', function(done) {

      var args = {
        context: {
          '@base': 'http://dbpedia.org/resource/'
        },
        '@id': 'Paul_McCartney'
      };

      var dataStream = highland(datasets);

      var selectedKeys = ['@id'];

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
    //*/

    /* TODO this fails
    it('should match a compacted JSON-LD document by @id (compact IRI)', function(done) {

      var args = {
        context: {
          'dbpedia': 'http://dbpedia.org/resource/'
        },
        '@id': 'dbpedia:Paul_McCartney'
      };

      var dataStream = highland(datasets);

      var selectedKeys = ['@id'];

      jsonldMatcher.tieredFind(
        args,
        dataStream,
        name,
        selectedKeys
      )
      .last()
      .each(function(result) {
        console.log('result');
        console.log(result);
        expect(result).to.eql(targetMatch);
        return done();
      });
    });
    //*/
  });

  /*
  describe('graph', function() {

    // TODO this fails
    it('should match for @graph', function(done) {
      var targetElement = _.clone(datasetsClone[7]);
      var targetMatch = _.find(targetElement['@graph'], function(item) {
        return item['@id'] === 'dbpedia:Neil_deGrasse_Tyson';
      });
      targetMatch['@context'] = targetElement['@context'];
      console.log('targetMatch @id');
      console.log(targetMatch['@id']);

      var args = {
        '@id': 'http://dbpedia.org/resource/Neil_deGrasse_Tyson',
        'givenName': 'Neil'
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
  });
  //*/

});
