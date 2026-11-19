# Solo pruebas locales: MariaDB (compatible con MySQL, como en cPanel) instalada desde Debian.
# Se usa porque la descarga de la imagen oficial de MySQL desde Docker Hub se corta en este PC.
FROM php:8.2-apache
RUN apt-get update && apt-get install -y --no-install-recommends mariadb-server && rm -rf /var/lib/apt/lists/* \
 && sed -ri 's/^bind-address.*/bind-address = 0.0.0.0/' /etc/mysql/mariadb.conf.d/50-server.cnf
COPY db-init.sh /usr/local/bin/db-init.sh
RUN chmod +x /usr/local/bin/db-init.sh
EXPOSE 3306
CMD ["/usr/local/bin/db-init.sh"]
