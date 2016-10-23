;(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    define(['angular'], factory);
  } else if (typeof exports === 'object') {
    module.exports = factory(require('angular'));
  } else {
    root.returnExports = factory(root.angular);
  }
}(this, function(angular) {
'use strict';

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

/**
 * The bind-ce directive binds Custom Elements to Angular 1.x
 *
 * @license MIT (see LICENSE.md)
 * @author Bram Gotink <github.com/bgotink>
 * @see inspired by the work of Chris Strom et al, see <https://github.com/eee-c/angular-bind-polymer>
 */

angular.module('bgotink.customElements', []).directive('bindCe', ['$parse', '$interpolate', function ($parse, $interpolate) {
  function setCeValue(element, regularKey, normalizedKey, value) {
    if (angular.isArray(value)) {
      value = value.slice(0);
    } else if (angular.isObject(value)) {
      value = Object.assign({}, value);
    }

    if (normalizedKey in element) {
      element[normalizedKey] = value;
    } else {
      element.setAttribute(regularKey, value);
    }
  }

  function getCeValue(element, regularKey, normalizedKey) {
    if (normalizedKey in element) {
      return element[normalizedKey];
    } else {
      return element.getAttribute(regularKey);
    }
  }

  function denormalize(attributeName) {
    return attributeName.replace(/[A-Z]/, function (letter) {
      return '-' + letter.toLowerCase();
    });
  }

  return {
    // attribute only, NOT element (obviously, as this directive is to be used on a polymer element)
    restrict: 'A',

    // we do NOT require a scope, thanks for asking ;)
    scope: false,

    priority: 500,
    terminal: true,
    transclude: 'element',

    /*
     * Process the attributes once, use those in the link function.
     */
    compile: function compile($element, $attrs) {
      var angularAttributeMap = {};

      for (var attributeName in $attrs) {
        if (!$attrs.hasOwnProperty(attributeName)) {
          continue;
        }

        if (!attributeName.match(/^ce[A-Z]/)) {
          continue;
        }

        var attribute = $attrs[attributeName];

        // Remove the attribute from the template element
        $element.attr(denormalize(attributeName), null);

        // Remove leading `ce-` from attribute name
        attributeName = attributeName.charAt(2).toLowerCase() + attributeName.slice(3);
        var isExpression = attribute.match(/\{\{\s*[\.\w]+\s*\}\}/);

        // $interpolate expressions, $parse the rest
        if (isExpression) {
          angularAttributeMap[attributeName] = $interpolate(attribute);
        } else {
          angularAttributeMap[attributeName] = $parse(attribute);
        }
      }

      return function link($scope, $element, $attrs, ctrl, $transclude) {
        var registeredAngularUpdates = Object.create(null);
        function changeListener(event) {
          var name = event.type.substring(0, event.type.lastIndexOf('-changed'));
          var normalizedName = $attrs.$normalize(name);
          console.log('listen ' + normalizedName);

          if (!(normalizedName in angularAttributeMap)) {
            // This shouldn't happen, nothing to do here
            return;
          }

          var newValue = event.detail.value;
          if (event.detail.path) {
            newValue = getCeValue($element[0], name, normalizedName);
          }

          if (registeredAngularUpdates[normalizedName]) {
            // We already got an event and an update is still pending
            registeredAngularUpdates[normalizedName] = { newValue: newValue };
            return;
          }

          var getAngularValue = angularAttributeMap[normalizedName];
          var setAngularValue = getAngularValue.assign;

          registeredAngularUpdates[normalizedName] = { newValue: newValue };

          $scope.$evalAsync(function () {
            var oldValue = getAngularValue($scope);
            var newValue = registeredAngularUpdates[normalizedName].newValue;

            registeredAngularUpdates[normalizedName] = null;

            if (angular.equals(oldValue, newValue)) {
              return;
            }

            if (angular.isArray(oldValue)) {
              oldValue.length = 0;
              oldValue.push.apply(oldValue, _toConsumableArray(newValue));
            } else if (angular.isObject(oldValue)) {
              // FIXME: this won't work if a key was deleted...
              Object.assign(oldValue, newValue);
            } else {
              setAngularValue($scope, newValue);
            }
          });
        }

        // Link _to_ custom element

        var _loop = function _loop(normalizedName) {
          var getAngularValue = angularAttributeMap[normalizedName];
          var setAngularValue = getAngularValue.assign || angular.noop;

          var regularName = denormalize(normalizedName);

          $scope.$watch(getAngularValue, function (newValue, oldValue) {
            console.log('watch ' + normalizedName);
            var initial = newValue === oldValue;
            var ceValue = getCeValue($element[0], regularName, normalizedName);

            if (initial) {
              if (angular.isUndefined(newValue) && !angular.isUndefined(ceValue)) {
                // known in custom element, not yet in angular
                // so we send the custom element value to angular
                setAngularValue($scope, ceValue);
                return;
              }
            }

            if (!angular.equals(newValue, ceValue)) {
              setCeValue($element[0], regularName, normalizedName, newValue);
            }
          }, true);
        };

        for (var normalizedName in angularAttributeMap) {
          _loop(normalizedName);
        }

        var $newElement = $transclude($scope);
        $element.replaceWith($newElement);
        $element = $newElement;

        // Link _from_ custom element
        for (var _normalizedName in angularAttributeMap) {
          if (angular.isFunction(angularAttributeMap[_normalizedName].assign)) {
            $element.on(denormalize(_normalizedName) + '-changed', changeListener);
          }
        }

        $scope.$on('$destroy', function () {
          for (var _normalizedName2 in angularAttributeMap) {
            $element.off(denormalize(_normalizedName2) + '-changed', changeListener);
          }
        });
      };
    }
  };
}]);
return 'bgotink.customElements';
}));
