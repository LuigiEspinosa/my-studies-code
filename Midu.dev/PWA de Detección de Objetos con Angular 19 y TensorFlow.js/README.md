# MidudevPwa

This project was generated with [Angular CLI](https://github.com/angular/angular-cli) version 19.1.6.

## Course Setup

Para comenzar el curso, utiliza la rama `initial` que contiene el punto de partida inicial:
```bash
git checkout initial
```

## Development server

Run `ng serve` for a dev server. Navigate to `http://localhost:4200/`. The application will automatically reload if you change any of the source files.

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running as a PWA Locally

To test the Progressive Web App (PWA) functionality locally:

1. First build the project for production:
```bash
ng build
```

2. Install http-server globally (if you don't have it):
```bash
npm install -g http-server
```

3. Serve the built files from the dist directory:
```bash
http-server -p 8080 -c-1 dist/midudev-pwa/browser
```

Access your PWA at `http://localhost:8080`. The service worker will only work in production mode and over HTTPS or localhost.

## Additional Resources

- Si deseas más recursos sobre Angular, visita mi canal de YouTube [**dominicode**](https://youtube.com/dominicode)
- Para más información sobre Angular CLI, consulta la [documentación oficial](https://angular.dev/tools/cli)

<!-- studylink:begin -->

Study notes for this code:

- [midudev/pwa-de-deteccion-de-objetos-con-angular-19-y-tensorflow-js](https://github.com/LuigiEspinosa/my-studies/blob/main/Midu.dev/PWA%20de%20Detecci%C3%B3n%20de%20Objetos%20con%20Angular%2019%20y%20TensorFlow.js.md)

<!-- studylink:end -->
