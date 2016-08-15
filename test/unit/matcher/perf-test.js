var _ = require('lodash');
var fs = require('fs');
var JsonldRx = require('../../../lib/main.js');
var JsonldMatcher = require('../../../lib/matcher.js');
var Rx = require('rx');
var RxNode = require('rx-node-extra');

var jsonldRx = new JsonldRx();
var jsonldMatcher = new JsonldMatcher(jsonldRx);

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
// load cached, pre-processed reference records
var datasources = JSON.parse(fs.readFileSync(
    __dirname + '/expected-processed-datasources-for-gpml2bridgedb.jsonld',
    {encoding: 'utf8'}));
datasourcesSource = Rx.Observable.from(datasources)
.shareReplay();

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
.subscribeOnCompleted();
