
#!/bin/sh
set -eu

cat > /etc/nginx/conf.d/default.conf <<'EOF'
server {
    listen 1202;
    listen 1203;
    listen 1500;

    server_name _;

    location / {
        proxy_pass http://go-api:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Port $server_port;
    }
}
EOF
