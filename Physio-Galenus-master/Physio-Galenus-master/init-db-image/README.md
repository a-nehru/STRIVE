# Custom Init DB Image

This Docker image is used as a base image to init the database.

Scripts in `/docker-entrypoint-initdb.d` are only run if you start the container with a data directory that is empty; any pre-existing database will be left untouched on container startup.
