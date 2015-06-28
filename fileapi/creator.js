function createFileApi(execlib){
  'use strict';
  var util = require('./util')(execlib);

  return {
    DataBase: require('./dbcreator')(execlib, util),
    util: util
  };
}

module.exports = createFileApi;
