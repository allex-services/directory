function createServicePack(){
  'use strict';


  return {
    service: {
      dependencies: ['.', 'allex_directorylib']
    },
    sinkmap: {
      dependencies: ['.']
    },
    tasks: {
      dependencies: ['allex_directorylib']
    }
  };
}

module.exports = createServicePack;
