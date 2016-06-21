function createServicePack(){
  'use strict';


  return {
    service: {
      dependencies: ['.', 'allex:directory:lib']
    },
    sinkmap: {
      dependencies: ['.']
    },
    tasks: {
      dependencies: ['allex:directory:lib']
    }
  };
}

module.exports = createServicePack;
