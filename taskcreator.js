function createTasks(execlib){
  'use strict';
  return [{
    name: 'fetchOrCreateWithData',
    klass: require('./tasks/fetchOrCreateWithData')(execlib)
  },{
    name: 'transmitFile',
    klass: require('./tasks/transmitFile')(execlib)
  },{
    name: 'downloadFile',
    klass: require('./tasks/downloadFile')(execlib)
  }];
}

module.exports = createTasks;
