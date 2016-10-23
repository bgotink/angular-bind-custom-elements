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
          function changeListener(event) {
            const name = event.type.substring(0, event.type.lastIndexOf('-changed'));
            const normalizedName = $attrs.$normalize(name);
            console.log(`listen ${normalizedName}`);

            if (!(normalizedName in angularAttributeMap)) {
              // shouldn't happen, nothing to do here
              return;
            }

            const getAngularValue = angularAttributeMap[normalizedName];
            const setAngularValue = getAngularValue.assign;

            const newValue = event.detail.value;
            const oldValue = getAngularValue($scope);

            if (!angular.equals(newValue, oldValue) && angular.isFunction(setAngularValue)) {
              if (angular.isArray(oldValue)) {
                oldValue.length = 0;
                oldValue.push(...newValue);
              } else if (angular.isObject(oldValue)) {
                // FIXME: this won't work if a key was deleted...
                Object.assign(oldValue, newValue);
              } else {
                setAngularValue($scope, newValue);
              }
            }
          }

          for (let normalizedName in angularAttributeMap) {
            const getAngularValue = angularAttributeMap[normalizedName];
            const setAngularValue = getAngularValue.assign || angular.noop;

            const regularName = denormalize(normalizedName);

            // Link _to_ custom element

            let initial = true;
            $scope.$watch(getAngularValue, newValue => {
              console.log(`watch ${normalizedName}`);
              const ceValue = getCeValue($element[0], regularName, normalizedName);

              if (initial) {
                initial = false;

                if (angular.isUndefined(newValue) && !angular.isUndefined(ceValue)) {
                  // known in custom element, not yet in angular
                  // so we send the custom element value to angular
                  setAngularValue($scope, ceValue);
                  return;
                }
              }

              if (newValue !== ceValue) {
                setCeValue($element[0], regularName, normalizedName, newValue);
              }
            });

            // Link _from_ custom element

            $element.on(`${regularName}-changed`, changeListener);
          }

          $scope.$on('$destroy', () => {
            for (let normalizedName in angularAttributeMap) {
              $element.off(`${denormalize(normalizedName)}-changed`, changeListener);
            }
          });

          $newElement = $transclude($scope);
          $element.replaceWith($newElement);
          $element = $newElement;
        };
      }
    };
  }
]);
