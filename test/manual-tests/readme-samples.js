var JsonldRx = require('../../index.js');
var jsonldRx = new JsonldRx();

var doc = {
  'http://schema.org/name': 'Manu Sporny',
  'http://schema.org/url': {'@id': 'http://manu.sporny.org/'},
  'http://schema.org/image': {'@id': 'http://manu.sporny.org/images/manu.png'}
};
var context = {
  'name': 'http://schema.org/name',
  'homepage': {'@id': 'http://schema.org/url', '@type': '@id'},
  'image': {'@id': 'http://schema.org/image', '@type': '@id'}
};

var docToFrame = {
  '@context': {
    'dc': 'http://purl.org/dc/elements/1.1/',
    'ex': 'http://example.org/vocab#',
    'xsd': 'http://www.w3.org/2001/XMLSchema#',
    'ex:contains': {
      '@type': '@id'
    }
  },
  '@graph': [
    {
      '@id': 'http://example.org/library',
      '@type': 'ex:Library',
      'ex:contains': 'http://example.org/library/the-republic'
    },
    {
      '@id': 'http://example.org/library/the-republic',
      '@type': 'ex:Book',
      'dc:creator': 'Plato',
      'dc:title': 'The Republic',
      'ex:contains': 'http://example.org/library/the-republic#introduction'
    },
    {
      '@id': 'http://example.org/library/the-republic#introduction',
      '@type': 'ex:Chapter',
      'dc:description': 'An introductory chapter on The Republic.',
      'dc:title': 'The Introduction'
    }
  ]
};

var frame = {
  '@context': {
    'dc': 'http://purl.org/dc/elements/1.1/',
    'ex': 'http://example.org/vocab#'
  },
  '@type': 'ex:Library',
  'ex:contains': {
    '@type': 'ex:Book',
    'ex:contains': {
      '@type': 'ex:Chapter'
    }
  }
};

var docWithRemoteContext = {
  '@context': 'http://json-ld.org/contexts/person.jsonld',
  '@id': 'http://dbpedia.org/resource/John_Lennon',
  'name': 'John Lennon',
  'born': '1940-10-09',
  'spouse': 'http://dbpedia.org/resource/Cynthia_Lennon'
};

jsonldRx.compact(docWithRemoteContext, docWithRemoteContext['@context'])
.subscribe(function(compacted) {
  console.log('compacted');
  console.log(JSON.stringify(compacted, null, 2));//  //  {
  //    "@context": {...},
  //    "name": "Manu Sporny",
  //    "homepage": "http://manu.sporny.org/",
  //    "image": "http://manu.sporny.org/images/manu.png"
  //  }
}, function(err) {
  console.log('err');
  console.log(err);
  throw err;
});

jsonldRx.expand(docWithRemoteContext)
.subscribe(function(expanded) {
  console.log('expanded');
  console.log(JSON.stringify(expanded, null, 2));
  /* Output:
  {
    "http://schema.org/name": [{"@value": "Manu Sporny"}],
    "http://schema.org/url": [{"@id": "http://manu.sporny.org/"}],
    "http://schema.org/image": [{"@id": "http://manu.sporny.org/images/manu.png"}]
  }
  */
}, function(err) {
  console.log('err');
  console.log(err);
  throw err;
});

// compact a document according to a particular context
// see: http://json-ld.org/spec/latest/json-ld/#compacted-document-form
jsonldRx.compact(doc, context).concatMap(function(compacted) {
  console.log(JSON.stringify(compacted, null, 2));
  /* Output:
  {
    "@context": {...},
    "name": "Manu Sporny",
    "homepage": "http://manu.sporny.org/",
    "image": "http://manu.sporny.org/images/manu.png"
  }
  */
  // expand a document, removing its context
  // see: http://json-ld.org/spec/latest/json-ld/#expanded-document-form
  return jsonldRx.expand(compacted);
})
.subscribe(function(expanded) {
  console.log(JSON.stringify(expanded, null, 2));
  /* Output:
  {
    "http://schema.org/name": [{"@value": "Manu Sporny"}],
    "http://schema.org/url": [{"@id": "http://manu.sporny.org/"}],
    "http://schema.org/image": [{"@id": "http://manu.sporny.org/images/manu.png"}]
  }
  */
}, function(err) {
  console.log('err');
  console.log(err);
  throw err;
});

// flatten a document
// see: http://json-ld.org/spec/latest/json-ld/#flattened-document-form
jsonldRx.flatten(doc)
.subscribe(function(flattened) {
  console.log(JSON.stringify(flattened, null, 2));
  // all deep-level trees flattened to the top-level
}, function(err) {
  console.log('err');
  console.log(err);
  throw err;
});

// frame a document
// see: http://json-ld.org/spec/latest/json-ld-framing/#introduction
jsonldRx.frame(docToFrame, frame)
.subscribe(function(framed) {
  // document transformed into a particular tree structure per the given frame
  console.log('framed');
  console.log(JSON.stringify(framed, null, 2));
  // document transformed into a particular tree structure per the given frame
}, function(err) {
  console.log('err');
  console.log(err);
  throw err;
});

// normalize a document using the RDF Dataset Normalization Algorithm
// (URDNA2015), see: http://json-ld.github.io/normalization/spec/
jsonldRx.normalize(doc, {
  algorithm: 'URDNA2015',
  format: 'application/nquads'
})
.subscribe(function(normalized) {
  console.log(JSON.stringify(normalized, null, 2));
  // normalized is a string that is a canonical representation of the document
  // that can be used for hashing, comparison, etc.
}, function(err) {
  console.log('err');
  console.log(err);
  throw err;
});

// serialize a document to N-Quads (RDF)
jsonldRx.toRDF(doc, {format: 'application/nquads'})
.concatMap(function(nquads) {
  console.log(nquads);
  // nquads is a string of nquads
  // deserialize N-Quads (RDF) to JSON-LD
  return jsonldRx.fromRDF(nquads, {format: 'application/nquads'});
})
.subscribe(function(doc) {
  console.log(JSON.stringify(doc, null, 2));
  // doc is JSON-LD
}, function(err) {
  console.log('err');
  console.log(err);
  throw err;
});

// use the promises API
var promises = jsonldRx.promises;

// compaction
promises.compact(doc, context)
.then(function(compacted) {
  console.log(JSON.stringify(compacted, null, 2));
  // expansion
  return promises.expand(compacted);
})
.then(function(expanded) {
  console.log(JSON.stringify(expanded, null, 2));
}, function(err) {
  throw err;
});

// flattening
promises.flatten(doc)
.then(function(flattened) {
  console.log(JSON.stringify(flattened, null, 2));
}, function(err) {
  throw err;
});

// framing
promises.frame(docToFrame, frame)
.then(function(framed) {
  console.log(JSON.stringify(framed, null, 2))
}, function(err) {
  throw err;
});

// normalization
promises.normalize(doc, {format: 'application/nquads'})
.then(function(normalized) {
  console.log(normalized);
}, function(err) {
  throw err;
});

// serialize to RDF
promises.toRDF(doc, {format: 'application/nquads'})
.then(function(nquads) {
  console.log(nquads);

  // deserialize from RDF
  return promises.fromRDF(nquads, {format: 'application/nquads'});
})
.then(function(doc) {
  console.log(JSON.stringify(doc, null, 2));
}, function(err) {
  throw err;
});

//*
new JsonldRx().expand(doc)
.subscribe(function(expanded) {
  console.log('expanded');
  console.log(JSON.stringify(expanded, null, 2));
  //  {
  //    "http://schema.org/name": [{"@value": "Manu Sporny"}],
  //    "http://schema.org/url": [{"@id": "http://manu.sporny.org/"}],
  //    "http://schema.org/image": [{"@id": "http://manu.sporny.org/images/manu.png"}]
  //  }
}, function(err) {
  throw err;
});

var first = new JsonldRx();
first.ActiveContextCache = 1;

var second = new JsonldRx();
console.log('second.ActiveContextCache');
console.log(second.ActiveContextCache);

var third = new JsonldRx();
console.log('third.ActiveContextCache');
console.log(third.ActiveContextCache);
//*/
