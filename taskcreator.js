function createTasks(execlib){
  'use strict';
  return [{
    name: 'fetchOrCreateWithData',
    klass: require('./tasks/fetchOrCreateWithData')(execlib)
  },{
    name: 'transmitFile',
    klass: require('./tasks/transmitFile')(execlib)
  }];
}

module.exports = createTasks;
