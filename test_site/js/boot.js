angular.module('pb.app', ['ui.router', 'allex.lib', 'angular.allex_directory'])
.config(function($stateProvider, $urlRouterProvider) {
  //your router setup goes here ... visit https://github.com/angular-ui/ui-router for more info ...
  $urlRouterProvider.otherwise('/initial');
  $stateProvider
    .state('initial',{
      url:'/initial',
      controller: 'pb.app.formtest',
      templateUrl:'partials/initial.html'
    });
})

.controller('pb.app.formtest', ['$scope', function ($scope) {
    $scope.json = [{
      'title': 'Moja prva forma',
      'description': 'Samo da te vidim',
      'type':'string',
      'format':'email'
    },
    {
      'title': 'Moja prva forma',
      'description': 'Samo da te vidim',
      'enum':[1,2,3],
      'enumLabels':['Jedan', 'Dva', 'Tri', 'Cetiri', 'Pet', 'Sest'],
      'required':true
    }];
    $scope.vals = [];
    $scope.error = null;
}]);
