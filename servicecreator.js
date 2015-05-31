function createDirectoryService(execlib,ParentServicePack){
  var ParentService = ParentServicePack.Service,
      lib = execlib.lib;

  function factoryCreator(parentFactory){
    return {
      'service': require('./users/serviceusercreator')(execlib,parentFactory.get('service')),
      'user': require('./users/usercreator')(execlib,parentFactory.get('user')) 
    };
  }

  function DirectoryService(prophash){
    ParentService.call(this,prophash);
    if(!('path' in prophash)){
      throw new lib.Error('propertyhash misses the path field');
    }
  }
  ParentService.inherit(DirectoryService,factoryCreator);
  DirectoryService.prototype.__cleanUp = function(){
    ParentService.prototype.__cleanUp.call(this);
  };
  
  return DirectoryService;
}

module.exports = createDirectoryService;
