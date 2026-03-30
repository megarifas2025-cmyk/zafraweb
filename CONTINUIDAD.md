# Continuidad del trabajo (otra cuenta Cursor / otro equipo)

## Qué quedó guardado

- Cambios versionados en Git: `app.config.js`, `.env.example`, `LoginScreen.tsx`, `.gitignore`, capturas PNG y dumps XML de depuración en la raíz del proyecto.
- El archivo `Exponent-2.31.2.apk` **no** está en Git (está en `.gitignore`). Sigue en tu carpeta local si lo necesitas; al copiar el proyecto, cópialo a mano si quieres conservarlo.

## Sin remoto Git

Este repo **no tiene `origin` configurado**. Para seguir en otro PC o con otra cuenta de Cursor:

1. **Opción A:** Copia toda la carpeta del proyecto (incluido `.git` y, si quieres, el `.apk`).
2. **Opción B:** Crea un repo en GitHub/GitLab, luego en esta máquina:
   - `git remote add origin <URL>`
   - `git push -u origin main`
   En el otro equipo: `git clone <URL>` y `npm install`.

## Al abrir el proyecto de nuevo

```bash
cd Unicornio
npm install
```

Copia `.env` desde `.env.example` si aún no tienes variables locales (no subas secretos al remoto).
