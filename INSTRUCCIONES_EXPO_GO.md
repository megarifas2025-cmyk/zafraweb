# ZafraClic – Expo SDK 54

El proyecto está alineado con **Expo SDK 54** y **Expo Go desde Play Store** (p. ej. 54.x).

## Inicio

```powershell
cd C:\Users\10\Desktop\Unicornio
npm install
npm run start
```

En la terminal: pulsa **`a`** para abrir en el emulador, o en Expo Go usa `exp://10.0.2.2:8081` (emulador → tu PC).

## Si algo falla

```powershell
npm cache clean --force
Remove-Item -Recurse -Force node_modules, package-lock.json
npm install
```

Si tenías carpetas `android/` o `ios/` generadas con otra versión de SDK, **bórralas** y vuelve a usar solo Expo Go o ejecuta `npx expo prebuild` cuando lo necesites.
