function createDirectoryUserTester(execlib,Tester){
  'use strict';
  var lib = execlib.lib,
      q = lib.q;

  function DirectoryUserTester(prophash,client){
    Tester.call(this,prophash,client);
    console.log('runNext finish');
    lib.runNext(this.finish.bind(this,0));
  }
  lib.inherit(DirectoryUserTester,Tester);

  return DirectoryUserTester;
}

module.exports = createDirectoryUserTester;
