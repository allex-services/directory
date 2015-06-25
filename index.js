function createServicePack(execlib){
  'use strict';
  var execSuite = execlib.execSuite,
  ParentServicePack = execSuite.registry.get('.');
  require('./parserregistryintroducer')(execlib);

  return {
    Service: require('./servicecreator')(execlib,ParentServicePack),
    SinkMap: require('./sinkmapcreator')(execlib,ParentServicePack),
    Tasks: require('./taskcreator')(execlib)
  };
}

module.exports = createServicePack;
