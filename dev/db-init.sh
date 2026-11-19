#!/bin/sh
# Arranca MariaDB y crea la base "nyanga" con el usuario de pruebas (solo local).
set -e
mkdir -p /run/mysqld && chown mysql:mysql /run/mysqld
if [ ! -d /var/lib/mysql/mysql ]; then
  mariadb-install-db --user=mysql --datadir=/var/lib/mysql >/dev/null
fi
mariadbd --user=mysql --datadir=/var/lib/mysql &
pid=$!
for i in $(seq 1 30); do mariadb -uroot -e "SELECT 1" >/dev/null 2>&1 && break; sleep 1; done
mariadb -uroot -e "CREATE DATABASE IF NOT EXISTS nyanga CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  CREATE USER IF NOT EXISTS 'nyanga'@'%' IDENTIFIED BY 'nyanga-dev';
  GRANT ALL PRIVILEGES ON nyanga.* TO 'nyanga'@'%'; FLUSH PRIVILEGES;"
echo "MariaDB lista"
wait $pid
