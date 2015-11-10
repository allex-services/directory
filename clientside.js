function createClientSide(execlib, fileapi){
  'use strict';
  var execSuite = execlib.execSuite,
  ParentServicePack = execSuite.registry.get('.');

  return {
    SinkMap: require('./sinkmapcreator')(execlib,ParentServicePack),
    Tasks: require('./taskcreator')(execlib, fileapi)
  };
}

module.exports = createClientSide;
