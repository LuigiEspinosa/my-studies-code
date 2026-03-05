#include <stdio.h>

/* Functions */
float toCelsius(float);

float toCelsius(float f) { return (5.0 / 9.0) * (f - 32.0); }

int main(void) {
  float fahr, celsius;
  float lower, upper, step;

  lower = 0;   /* Lower limit of temperature scale */
  upper = 300; /* Upper limit */
  step = 20;   /* Step size */

  fahr = lower;
  printf("Fahrenheit\tCelsius\n");

  while (fahr <= upper) {
    celsius = toCelsius(fahr);

    printf("%10.0f\t%7.2f\n", fahr, celsius);
    fahr += step;
  }

  return 0;
}
