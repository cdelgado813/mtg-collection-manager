# 🎴 MTG Collection Manager

**Gestor de colección de Magic: The Gathering** con interfaz web moderna, búsqueda avanzada, tracking de precios y soporte directo para exportaciones de Manabox.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D16-brightgreen.svg)

## ✨ Características

- 📤 **Importación CSV** - Compatible con Manabox y formato personalizado
- 🔍 **Búsqueda avanzada** - Por nombre, color, tipo, rareza, set
- 🖼️ **Vista de galería** - Imágenes de alta calidad vía Scryfall API
- 💰 **Tracking de precios** - Precios actualizados en EUR/USD
- 📊 **Estadísticas** - Valor total, cantidad de cartas, foils
- ⚡ **Responsive** - Funciona en desktop, tablet y móvil
- 🗄️ **Base de datos local** - SQLite, sin necesidad de servidor externo

## 🚀 Instalación

### Requisitos
- Node.js >= 16
- npm o yarn

### Pasos

```bash
# Clonar el repositorio
git clone https://github.com/TU_USUARIO/mtg-collection-manager.git
cd mtg-collection-manager

# Instalar dependencias
npm install

# Iniciar el servidor
npm start
```

El servidor arrancará en `http://localhost:3000`

## 📋 Formato CSV

### Manabox (recomendado)
Exporta directamente desde Manabox y sube el CSV sin modificar.

```csv
Binder Name,Binder Type,Name,Set code,Quantity,Foil,Condition,Scryfall ID
Main,Collection,Lightning Bolt,2XM,4,normal,NM,abc123...
```

### Formato simple
```csv
nombre,set,cantidad,foil,condicion
Lightning Bolt,2XM,4,false,NM
Polluted Delta,KTK,1,true,LP
Sol Ring,CMR,2,false,NM
```

## 🛠️ Uso

1. **Subir CSV**: Haz clic en "Subir CSV" y selecciona tu archivo
2. **Buscar**: Usa el campo de búsqueda o filtros por color/rareza
3. **Gestionar**: Edita cantidades o elimina cartas
4. **Estadísticas**: Consulta el valor total y distribución

## 🔧 Configuración

### Puerto
Por defecto usa el puerto `3000`. Para cambiarlo:

```bash
PORT=8080 npm start
```

O edita directamente `server.js`:

```javascript
const PORT = 3000; // Cambia aquí
```

## 🌐 Despliegue

### Raspberry Pi / VPS

```bash
# Como servicio systemd
sudo npm install -g pm2
pm2 start server.js --name mtg-collection
pm2 startup
pm2 save
```

### Docker (próximamente)

```bash
docker-compose up -d
```

## 🤝 Contribuir

Las contribuciones son bienvenidas:

1. Fork el proyecto
2. Crea tu feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add AmazingFeature'`)
4. Push al branch (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📝 Roadmap

- [ ] Wishlist de cartas
- [ ] Tracking automático de precios (alertas)
- [ ] Export de colección
- [ ] Modo oscuro/claro
- [ ] Comparación de precios entre vendors
- [ ] Integración con TCGPlayer/Cardmarket
- [ ] Análisis de decks
- [ ] Autenticación de usuarios

## 📄 Licencia

MIT License - ver [LICENSE](LICENSE) para más detalles

## 🙏 Agradecimientos

- [Scryfall](https://scryfall.com/) - API de cartas y precios
- [Manabox](https://manabox.app/) - Inspiración y formato de exportación
- Comunidad MTG

---

**Hecho con ❤️ para la comunidad de Magic: The Gathering**
