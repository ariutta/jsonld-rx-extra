module.exports = function(input) {
  var keepRes = [
    '^(lib|test)(\/([^\/\.])+)*$',
    '^\.+(\.js|\.json|\.jsonld|\.ts|\.html)$',
  ];
  var rejectRes = [
    '\.git',
    '^test\/lib',
    'jspm_packages',
    'node_modules',
  ];
  var runningMatched = function(acc, re) {
    return acc ? acc : input.match(new RegExp(re));
  };
  return !rejectRes.reduce(runningMatched, false) &&
         keepRes.reduce(runningMatched, false);
};
