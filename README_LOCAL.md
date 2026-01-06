# 🛑 ADVERTENCIA DE DESARROLLO

**ESTE BOT NO DEBE SER EJECUTADO LOCALMENTE.**

El bot oficial se encuentra ejecutándose en la nube. Ejecutarlo localmente puede causar:

1. **Colisiones de Comandos**: Discord enviará eventos a ambas instancias, causando respuestas duplicadas.
2. **Ruido en Auditoría**: Logs innecesarios en los canales de Discord.
3. **Consumo de API**: Superar los límites de rate-limit de Discord.

El backend ha sido configurado para fallar en silencio si no encuentra el bot localmente. Si necesitas probar funcionalidades del bot, solicita acceso al entorno de staging o consulta con el administrador.
