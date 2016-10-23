/**
 * The bind-ce directive binds Custom Elements to Angular 1.x
 *
 * @license MIT (see LICENSE.md)
 * @author Bram Gotink <github.com/bgotink>
 * @see inspired by the work of Chris Strom et al, see <https://github.com/eee-c/angular-bind-polymer>
 */

angular
.module('bgotink.customElements', [])
.directive('bindCe', [
  '$parse',
  '$interpolate',
  function($parse, $interpolate) {
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
          if (!$attrs.hasOwnProperty(attributeName)) {
            continue;
          }

          if (!attributeName.match(/^ce[A-Z]/)) {
            continue;
          }

          let attribute = $attrs[attributeName];

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
          const registeredAngularUpdates = Object.create(null);
          function changeListener(event) {
            const name = event.type.substring(0, event.type.lastIndexOf('-changed'));
            const normalizedName = $attrs.$normalize(name);
            console.log(`listen ${normalizedName}`);

            if (!(normalizedName in angularAttributeMap)) {
              // This shouldn't happen, nothing to do here
              return;
            }

            let newValue = event.detail.value;
            if (event.detail.path) {
              newValue = getCeValue($element[0], name, normalizedName);
            }

            if (registeredAngularUpdates[normalizedName]) {
              // We already got an event and an update is still pending
              registeredAngularUpdates[normalizedName] = { newValue };
              return;
            }

            const getAngularValue = angularAttributeMap[normalizedName];
            const setAngularValue = getAngularValue.assign;

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

          // Link _to_ custom element
          for (let normalizedName in angularAttributeMap) {
            const getAngularValue = angularAttributeMap[normalizedName];
            const setAngularValue = getAngularValue.assign || angular.noop;

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

          // Link _from_ custom element
          for (let normalizedName in angularAttributeMap) {
            if (angular.isFunction(angularAttributeMap[normalizedName].assign)) {
              $element.on(`${denormalize(normalizedName)}-changed`, changeListener);
            }
          }

          $scope.$on('$destroy', () => {
            for (let normalizedName in angularAttributeMap) {
              $element.off(`${denormalize(normalizedName)}-changed`, changeListener);
            }
          });
        };
      }
    };
  }
]);
