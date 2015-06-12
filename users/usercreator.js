var fs = require('fs');

function createUser(execlib,ParentUser){
  'use strict';

  if(!ParentUser){
    ParentUser = execlib.execSuite.ServicePack.Service.prototype.userFactory.get('user');
  }

  function User(prophash){
    ParentUser.call(this,prophash);
  }
  ParentUser.inherit(User,require('../methoddescriptors/user'),[/*visible state fields here*/]/*or a ctor for StateStream filter*/);
  User.prototype.__cleanUp = function(){
    ParentUser.prototype.__cleanUp.call(this);
  };
  User.prototype.fetch = function(filename,defer){
    try{
      defer.resolve(
        this.__service.fileToData(
          fs.readFileSync(this.__service.pathForFilename(filename))
        )
      );
    }
    catch(e){
      defer.reject(e);
    }
  };
  User.prototype.write = function(filename,data,defer){
    if(data===null){
      try{
        fs.closeSync(fs.openSync(this.__service.pathForFilename(filename),'w'));
        defer.resolve({filesize:this.__service.fileSize(filename)});
      }
      catch(e){
        console.log(e);
        defer.reject(e);
      }
    }else{
      try{
        fs.writeFileSync(this.__service.pathForFilename(filename),this.__service.dataToFile(data));
        defer.resolve({filesize:this.__service.fileSize(filename)});
      }
      catch(e){
        console.log(e);
        defer.reject(e);
      }
    }
  };
  User.prototype.append = function(filename,data,defer){
    try{
      fs.appendFileSync(this.__service.pathForFilename(filename),this.__service.dataToFile(data));
      defer.resolve({filesize:this.__service.fileSize(filename)});
    }
    catch(e){
      console.log(e);
      defer.reject(e);
    }
  };

  return User;
}

module.exports = createUser;
