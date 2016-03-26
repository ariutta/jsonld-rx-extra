var JsonldRx = require('../../index.js');
var jsonldRx = new JsonldRx();

var input0 = {
  '@context': ['https://wikipathwayscontexts.firebaseio.com/bridgedb/.json'],
  '@id': 'dbpedia:Einsteinian',
  'http://bridgedb.org/input-vocab/aksdnvskjdv': 'ansjdnvahsbdv'
};

jsonldRx.defaultNormalize(input0)
.subscribe(console.log, console.error)

var input0 = {
  '@context': ['https://wikipathwayscontexts.firebaseio.com/bridgedb/.json'],
  '@id': 'dbpedia:Einsteinian',
  'http://bridgedb.org/input-vocab/aksdnvskjdv': 'ansjdnvahsbdv'
};

jsonldRx.defaultNormalize(input0)
.subscribe(console.log, console.error)

/*
var input1 = {
  '@context': ['https://wikipathwayscontexts.firebaseio.com/bridgedb/.json'],
  '@id': 'dbpedia:Einsteinian'
};

jsonldRx.defaultNormalize(input1)
.subscribe(console.log, console.error)

var input2 = {
  '@context': ['https://wikipathwayscontexts.firebaseio.com/bridgedb/.json'],
  'alternatePrefix':['Bc']
};

jsonldRx.defaultNormalize(input2)
.subscribe(console.log, console.error)

var input3 = { '@context': [ 'https://wikipathwayscontexts.firebaseio.com/bridgedb/.json' ],
  '@id': 'dbpedia:The_Radium_Woman' };

jsonldRx.defaultNormalize(input3)
.subscribe(console.log, console.error)

var input4 = { '@context': [ 'https://wikipathwayscontexts.firebaseio.com/bridgedb/.json' ],
  '@id': 'dbpedia:Marie_Curie\'s_birthplace' };

jsonldRx.defaultNormalize(input4)
.subscribe(console.log, console.error)
//*/
