(function (lib, module) {

  module.factory ('allex_directory.UploadControllerF', ['allex.lib.UserDependent', function(Dependent) {
    function UploadController ($scope) {
      Dependent.call(this, $scope);
    }
    lib.inherit(UploadController, Dependent);
    UploadController.prototype.__cleanUp = function () {
      Dependent.prototype.__cleanUp.call(this);
    };

    UploadController.prototype.send = function () {
    };

    return UploadController;
  }]);

  module.controller('allex_directory.UploadController', ['$scope', 'allex_directory.UploadControllerF', function ($scope, UploadController){
    new UploadController($scope);
  }]);

  module.directive('allexDirectoryUpload', [function () {
    return {
      restrict: 'E',
      scope: true,
      controller: 'allex_directory.UploadController',
      templateUrl: 'partials/allex_directoryservice/partials/upload.html'
    };
  }]);
})(ALLEX.lib, angular.module('angular.allex_directory', ['allex.lib']));
