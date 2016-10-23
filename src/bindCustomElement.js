/**
 * The bind-ce directive binds Custom Elements to Angular 1.x
 *
 * @license MIT (see LICENSE.md)
 * @author Bram Gotink <github.com/bgotink>
 * @see inspired by the work of Chris Strom et al, see <https://github.com/eee-c/angular-bind-polymer>
 */

angular
.module('bgotink.customElements', [])
.provider('customElementSettings', function () {
  const options = {
    attributeToEvent(attributeName) {
      return `${attributeName}-changed`;
    },

    eventToAttribute(eventName) {
      return eventName.substring(0, event.type.lastIndexOf('-changed'));
    },
  };

  this.setAttributeToEventMapper = (fn) => {
    options.attributeToEvent = fn;
  };

  this.setEventToAttributeMapper = (fn) => {
    options.eventToAttribute = fn;
  }

  this.$get = () => Object.assign({}, options);
})
.directive('bindCe', [
  '$parse',
  '$interpolate',
  'customElementSettings',
  function($parse, $interpolate, customElementSettings) {
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
      return attributeName.replace(/[A-Z]/, letter => `-${letter.toLowerCase()}`);
    }

    function stripFromAttribute(attributeName, { length: charsToStrip }) {
      return attributeName.charAt(charsToStrip).toLocaleLowerCase() + attributeName.slice(charsToStrip + 1);
    }

    const hasProperty = Object.prototype.hasOwnProperty;

    return {
      // attribute only, NOT element (obviously, as this directive is to be used on a polymer element)
      restrict: 'A',

      // we do NOT require a scope, thanks for asking ;)
      scope : false,

      priority: 500,
      terminal: true,
      transclude: 'element',

      /*
       * Process the attributes once, use those in the link function.
       */
      compile: function ($element, $attrs) {
        const angularAttributeMap = {};

        for (let attributeName in $attrs) {
          if (!hasProperty.call($attrs, attributeName)) {
            continue;
          }

          if (!attributeName.match(/^ce[A-Z]/)) {
            continue;
          }

          let attribute = $attrs[attributeName];

          // Remove leading `ce-` from attribute name
          attributeName = stripFromAttribute(attributeName, 'ce');
          var isExpression = attribute.match(/\{\{\s*[\.\w]+\s*\}\}/);

          let bind = false;
          let listen = false;
          let twoWayBind = false;

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
          let getter;
          if (isExpression) {
            getter = $interpolate(attribute);
          } else {
            getter = $parse(attribute);
          }

          const setter = getter.assign;

          if (twoWayBind && !angular.isFunction(setter)) {
            throw new TypeError(`Cannot write to ${attribute}`)
          }

          angularAttributeMap[attributeName] = {
            getter, setter,
            bind, listen, twoWayBind,
          };
        }

        console.log(angularAttributeMap);

        return function link($scope, $element, $attrs, ctrl, $transclude) {
          const registeredAngularUpdates = {};

          function twoWayBindListener(event) {
            const name = customElementSettings.eventToAttribute(event.type);
            const normalizedName = $attrs.$normalize(name);
            console.log(`two way bind listen ${normalizedName}`);

            if (!hasProperty.call(angularAttributeMap, normalizedName)) {
              // This shouldn't happen, nothing to do here
              return;
            }

            let newValue = event.detail.value;
            if (event.detail.path) {
              newValue = getCeValue($element[0], name, normalizedName);
            }

            if (hasProperty.call(registeredAngularUpdates, normalizedName) && registeredAngularUpdates[normalizedName]) {
              // We already got an event and an update is still pending
              registeredAngularUpdates[normalizedName] = { newValue };
              return;
            }

            const getAngularValue = angularAttributeMap[normalizedName].getter;
            const setAngularValue = angularAttributeMap[normalizedName].setter;

            registeredAngularUpdates[normalizedName] = { newValue };

            $scope.$evalAsync(() => {
              const oldValue = getAngularValue($scope);
              const { newValue } = registeredAngularUpdates[normalizedName];
              registeredAngularUpdates[normalizedName] = null;

              if (angular.equals(oldValue, newValue)) {
                return;
              }

              if (angular.isArray(oldValue)) {
                oldValue.length = 0;
                oldValue.push(...newValue);
              } else if (angular.isObject(oldValue)) {
                // FIXME: this won't work if a key was deleted...
                Object.assign(oldValue, newValue);
              } else {
                setAngularValue($scope, newValue);
              }
            });
          }

          function regularListener(event) {
            const normalizedName = $attrs.$normalize(event.type);
            console.log(`listen ${normalizedName}`);

            // Make $event available in the callback
            $scope.$evalAsync(() => angularAttributeMap[normalizedName].getter($scope, { $event: event }));
          }

          // Link _to_ custom element
          for (let normalizedName in angularAttributeMap) {
            if (!angularAttributeMap[normalizedName].bind) {
              continue;
            }

            const getAngularValue = angularAttributeMap[normalizedName].getter;
            const setAngularValue = angularAttributeMap[normalizedName].setter || angular.noop;

            const regularName = denormalize(normalizedName);

            $scope.$watch(getAngularValue, (newValue, oldValue) => {
              console.log(`watch ${normalizedName}`);
              const initial = newValue === oldValue;
              const ceValue = getCeValue($element[0], regularName, normalizedName);

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
          }

          const $newElement = $transclude($scope);
          $element.replaceWith($newElement);
          $element = $newElement;

          const registeredListeners = {};

          // Link _from_ custom element
          for (let normalizedName in angularAttributeMap) {
            if (!angularAttributeMap[normalizedName].listen) {
              continue;
            }

            let eventName, listener;

            if (angularAttributeMap[normalizedName].twoWayBind) {
              eventName = customElementSettings.attributeToEvent(denormalize(normalizedName));
              listener = twoWayBindListener;
            } else {
              eventName = denormalize(normalizedName);
              listener = regularListener;
            }

            registeredListeners[eventName] = listener;
            $element.on(eventName, listener);
          }

          $scope.$on('$destroy', () => {
            for (let eventName in registeredListeners) {
              $element.off(eventName, registeredListeners[eventName]);
              registeredListeners[eventName] = null;
            }
          });

          console.log(registeredListeners);
        };
      }
    };
  }
]);
