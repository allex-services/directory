function createDirectoryServiceTester(execlib,Tester){
  'use strict';
  var lib = execlib.lib,
      q = lib.q;

  function DirectoryServiceTester(prophash,client){
    Tester.call(this,prophash,client);
    console.log('runNext finish');
    lib.runNext(this.finish.bind(this,0));
  }
  lib.inherit(DirectoryServiceTester,Tester);

  return DirectoryServiceTester;
}

module.exports = createDirectoryServiceTester;
