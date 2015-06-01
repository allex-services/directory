function createTasks(execlib){
  return [{
    name: 'fetchOrCreateWithData',
    klass: require('./tasks/fetchOrCreateWithData')(execlib)
  }];
}

module.exports = createTasks;
