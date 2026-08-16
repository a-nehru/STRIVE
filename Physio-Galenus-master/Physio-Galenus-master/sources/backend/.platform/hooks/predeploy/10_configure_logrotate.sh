#!/bin/bash

echo "Configuring logrotate"
cat <<'EOF' >/etc/cron.hourly/cron.logrotate.elasticbeanstalk.messages.conf
#!/bin/sh
test -x /usr/sbin/logrotate || exit 0
/usr/sbin/logrotate /etc/logrotate.elasticbeanstalk.hourly/logrotate.elasticbeanstalk.messages.conf
EOF

chmod a+x /etc/cron.hourly/cron.logrotate.elasticbeanstalk.messages.conf

cat <<'EOF' >/etc/logrotate.elasticbeanstalk.hourly/logrotate.elasticbeanstalk.messages.conf
/var/log/messages {
 su root root
 size 250M
 rotate 0
 missingok
 notifempty
}
EOF
