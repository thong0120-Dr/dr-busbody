#!/bin/sh
# สำรองข้อมูลรายวัน เก็บย้อนหลัง 30 วัน  (ตั้งให้รันด้วย cron ตามคู่มือ)
DIR=/opt/dr-busbody/data
mkdir -p "$DIR/backup"
cp "$DIR/data.json" "$DIR/backup/data-$(date +%F).json"
find "$DIR/backup" -name 'data-*.json' -mtime +30 -delete
