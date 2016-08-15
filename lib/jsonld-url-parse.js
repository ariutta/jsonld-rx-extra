// define URL parser
// parseUri 1.2.2
// (c) Steven Levithan <stevenlevithan.com>
// MIT License
// with local jsonld.js modifications

var _removeDotSegments = require('./remove-dot-segments.js');

var jsonldURLParserKeys = [
  'href',
  'protocol',
  'scheme',
  'authority',
  'auth',
  'user',
  'password',
  'hostname',
  'port',
  'path',
  'directory',
  'file',
  'query',
  'fragment'
];

var jsonldURLParserRegex = /^(([^:\/?#]+):)?(?:\/\/((?:(([^:@]*)(?::([^:@]*))?)?@)?([^:\/?#]*)(?::(\d*))?))?(?:(((?:[^?#\/]*\/)*)([^?#]*))(?:\?([^#]*))?(?:#(.*))?)/;

function jsonldURLParse(str) {
  var parsed = {};
  var m = jsonldURLParserRegex.exec(str);
  var i = jsonldURLParserKeys.length;
  while(i--) {
    parsed[jsonldURLParserKeys[i]] = (m[i] === undefined) ? null : m[i];
  }
  parsed.normalizedPath = _removeDotSegments(parsed.path, !!parsed.authority);
  return parsed;
}

module.exports = jsonldURLParse;
