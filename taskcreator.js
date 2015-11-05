function createTasks(execlib, fileapi){
  'use strict';
  return [{
    name: 'fetchOrCreateWithData',
    klass: require('./tasks/fetchOrCreateWithData')(execlib)
  },{
    name: 'transmitFile',
    klass: require('./tasks/transmitFile')(execlib, fileapi)
  },{
    name: 'downloadFile',
    klass: require('./tasks/downloadFile')(execlib, fileapi)
  },{
    name: 'downstreamFile',
    klass: require('./tasks/downstreamFile')(execlib)
  }];
}

module.exports = createTasks;
