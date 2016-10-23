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

angular.module('bgotink.customElements', []).provider('customElementSettings', function () {
  var options = {
    attributeToEvent: function attributeToEvent(attributeName) {
      return attributeName + '-changed';
    },
    eventToAttribute: function eventToAttribute(eventName) {
      return eventName.substring(0, event.type.lastIndexOf('-changed'));
    }
  };

  this.setAttributeToEventMapper = function (fn) {
    options.attributeToEvent = fn;
  };

  this.setEventToAttributeMapper = function (fn) {
    options.eventToAttribute = fn;
  };

  this.$get = function () {
    return Object.assign({}, options);
  };
}).directive('bindCe', ['$parse', '$interpolate', 'customElementSettings', function ($parse, $interpolate, customElementSettings) {
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

  function stripFromAttribute(attributeName, _ref) {
    var charsToStrip = _ref.length;

    return attributeName.charAt(charsToStrip).toLocaleLowerCase() + attributeName.slice(charsToStrip + 1);
  }

  var hasProperty = Object.prototype.hasOwnProperty;

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
        if (!hasProperty.call($attrs, attributeName)) {
          continue;
        }

        if (!attributeName.match(/^ce[A-Z]/)) {
          continue;
        }

        var attribute = $attrs[attributeName];

        // Remove leading `ce-` from attribute name
        attributeName = stripFromAttribute(attributeName, 'ce');
        var isExpression = attribute.match(/\{\{\s*[\.\w]+\s*\}\}/);

        var bind = false;
        var listen = false;
        var twoWayBind = false;

        if (attributeName.match(/^bindOn[A-Z]/)) {
          bind = true;
          listen = true;
          twoWayBind = true;
          attributeName = stripFromAttribute(attributeName, 'bindOn');
        } else if (attributeName.match(/^bind[A-Z]/)) {
          bind = true;
          attributeName = stripFromAttribute(attributeName, 'bind');
        } else if (attributeName.match(/^on[A-Z]/)) {
          listen = true;
          attributeName = stripFromAttribute(attributeName, 'on');
        }

        // $interpolate expressions, $parse the rest
        var getter = void 0;
        if (isExpression) {
          getter = $interpolate(attribute);
        } else {
          getter = $parse(attribute);
        }

        var setter = getter.assign;

        if (twoWayBind && !angular.isFunction(setter)) {
          throw new TypeError('Cannot write to ' + attribute);
        }

        angularAttributeMap[attributeName] = {
          getter: getter, setter: setter,
          bind: bind, listen: listen, twoWayBind: twoWayBind,
          attribute: attribute
        };
      }

      console.log(angularAttributeMap);

      return function link($scope, $element, $attrs, ctrl, $transclude) {
        var registeredAngularUpdates = {};

        function twoWayBindListener(event) {
          var name = customElementSettings.eventToAttribute(event.type);
          var normalizedName = $attrs.$normalize(name);
          console.log('two way bind listen ' + normalizedName);

          if (!hasProperty.call(angularAttributeMap, normalizedName)) {
            // This shouldn't happen, nothing to do here
            return;
          }

          var newValue = event.detail.value;
          if (event.detail.path) {
            newValue = getCeValue($element[0], name, normalizedName);
          }

          if (hasProperty.call(registeredAngularUpdates, normalizedName) && registeredAngularUpdates[normalizedName]) {
            // We already got an event and an update is still pending
            registeredAngularUpdates[normalizedName] = { newValue: newValue };
            return;
          }

          var getAngularValue = angularAttributeMap[normalizedName].getter;
          var setAngularValue = angularAttributeMap[normalizedName].setter;

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

        function regularListener(event) {
          var normalizedName = $attrs.$normalize(event.type);
          console.log('listen ' + normalizedName);
          console.log(angularAttributeMap[normalizedName].attribute, { $event: event });

          // Make $event available in the callback
          $scope.$evalAsync(angularAttributeMap[normalizedName].attribute, { $event: event });
        }

        // Link _to_ custom element

        var _loop = function _loop(normalizedName) {
          if (!angularAttributeMap[normalizedName].bind) {
            return 'continue';
          }

          var getAngularValue = angularAttributeMap[normalizedName].getter;
          var setAngularValue = angularAttributeMap[normalizedName].setter || angular.noop;

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
          var _ret = _loop(normalizedName);

          if (_ret === 'continue') continue;
        }

        var $newElement = $transclude($scope);
        $element.replaceWith($newElement);
        $element = $newElement;

        var registeredListeners = {};

        // Link _from_ custom element
        for (var _normalizedName in angularAttributeMap) {
          if (!angularAttributeMap[_normalizedName].listen) {
            continue;
          }

          var eventName = void 0,
              listener = void 0;

          if (angularAttributeMap[_normalizedName].twoWayBind) {
            eventName = customElementSettings.attributeToEvent(denormalize(_normalizedName));
            listener = twoWayBindListener;
          } else {
            eventName = denormalize(_normalizedName);
            listener = regularListener;
          }

          registeredListeners[eventName] = listener;
          $element.on(eventName, listener);
        }

        $scope.$on('$destroy', function () {
          for (var _eventName in registeredListeners) {
            $element.off(_eventName, registeredListeners[_eventName]);
            registeredListeners[_eventName] = null;
          }
        });

        console.log(registeredListeners);
      };
    }
  };
}]);
return 'bgotink.customElements';
}));
