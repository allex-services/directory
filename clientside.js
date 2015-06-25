function createClientSide(execlib){
  'use strict';
  var execSuite = execlib.execSuite,
  ParentServicePack = execSuite.registry.get('.');
  require('./parserregistryintroducer')(execlib);

  return {
    SinkMap: require('./sinkmapcreator')(execlib,ParentServicePack),
    Tasks: require('./taskcreator')(execlib)
  };
}

module.exports = createClientSide;
