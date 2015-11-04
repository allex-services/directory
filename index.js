function createServicePack(execlib){
  'use strict';

  var lib = execlib.lib,
    q = lib.q,
    d = q.defer(),
    execSuite = execlib.execSuite,
    libRegistry = execSuite.libRegistry;

    libRegistry.register('allex_directorylib').then(
      onDirectoryLib.bind(null, d, execlib),
      d.reject.bind(d)
    );

    return d.promise;

  /*
  var ret = require('./clientside')(execlib),
    execSuite = execlib.execSuite,
    ParentServicePack = execSuite.registry.get('.');

  require('./parserregistryintroducer')(execlib);
  ret.Service = require('./servicecreator')(execlib,ParentServicePack);

  return ret;
  */
}


function onDirectoryLib(defer, execlib) {
  'use strict';
  var ret = require('./clientside')(execlib),
    execSuite = execlib.execSuite,
    ParentServicePack = execSuite.registry.get('.');

  require('./parserregistryintroducer')(execlib);
  ret.Service = require('./servicecreator')(execlib,ParentServicePack);

  defer.resolve(ret);
}

module.exports = createServicePack;
