FROM postgres:12

# Add bash to entry point
ADD ./init-db.sh /docker-entrypoint-initdb.d
RUN sed -i 's/\r$//' /docker-entrypoint-initdb.d/init-db.sh

# Add .sql file if it exists
COPY . /tmp
RUN cp /tmp/*.sql /docker-entrypoint-initdb.d || true
RUN rm -rf /tmp

# Give permissions to execute the files
RUN chmod a+r /docker-entrypoint-initdb.d/*
