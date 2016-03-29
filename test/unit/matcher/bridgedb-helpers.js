var IDENTIFIERS = 'http://identifiers.org/';
var BRIDGEDB = 'http://vocabularies.bridgedb.org/ops#';
var DATASOURCES_LINKOUT_PATTERN_NS = BRIDGEDB + 'linkout_pattern';
var DATASOURCES_REGEX_NS = BRIDGEDB + 'regex';
var DATASOURCES_SYSTEM_CODE_NS = BRIDGEDB + 'system_code';
var DATASOURCES_URI_NS = BRIDGEDB + 'uri';
var DATASOURCES_WEBSITE_URL_NS = BRIDGEDB + 'website_url';

/**
 * getIdentifiersIriFromMiriamUrnInDataset
 *
 * @param {object} dataset expanded dataset based on datasources.txt and
                           datasources_headers.txt
 * @param {array} dataset['http://vocabularies.bridgedb.org/ops#uri'] length is no more than 1
 * @param {object} dataset['http://vocabularies.bridgedb.org/ops#uri'][0]
 * @param {string} dataset['http://vocabularies.bridgedb.org/ops#uri'][0]['@id']
 *                 e.g., "urn:miriam:ncbigene"
 * @return {string} e.g., "http://identifiers.org/ncbigene/"
 */
function getIdentifiersIriFromMiriamUrnInDataset(dataset) {
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

function getExpandedIdentifiersIriFromMiriamUrnInDataset(dataset) {
  var identifiersIri = getIdentifiersIriFromMiriamUrnInDataset(dataset);
  if (identifiersIri) {
    return {
      '@id': identifiersIri
    }
  }
}

/**
 * getPreferredPrefixFromMiriamUrnInDataset
 *
 * @param {object} dataset expanded dataset based on datasources.txt and
                           datasources_headers.txt
 * @param {array} dataset['http://vocabularies.bridgedb.org/ops#uri'] length is no more than 1
 * @param {object} dataset['http://vocabularies.bridgedb.org/ops#uri'][0]
 * @param {string} dataset['http://vocabularies.bridgedb.org/ops#uri'][0]['@id']
 *                 e.g., "urn:miriam:ncbigene"
 * @return {string} preferredPrefix from identifiers.org, e.g., "ncbigene"
 */
function getPreferredPrefixFromMiriamUrnInDataset(dataset) {
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

function getExpandedPreferredPrefixFromMiriamUrnInDataset(dataset) {
  var preferredPrefix = getPreferredPrefixFromMiriamUrnInDataset(dataset);
  if (preferredPrefix) {
    return {
      '@value': preferredPrefix
    };
  }
}

module.exports = {
  getIdentifiersIriFromMiriamUrnInDataset: getIdentifiersIriFromMiriamUrnInDataset,
  getExpandedIdentifiersIriFromMiriamUrnInDataset:
      getExpandedIdentifiersIriFromMiriamUrnInDataset,
  getPreferredPrefixFromMiriamUrnInDataset: getPreferredPrefixFromMiriamUrnInDataset,
  getExpandedPreferredPrefixFromMiriamUrnInDataset:
      getExpandedPreferredPrefixFromMiriamUrnInDataset
};
