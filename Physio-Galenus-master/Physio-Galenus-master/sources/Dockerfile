FROM node:14.18.2-bullseye

RUN  apt-get update -y && \
     apt-get upgrade -y && \
     apt-get -y autoremove && \
     apt-get clean

RUN apt-get install -y apt-utils \
    zip \
    unzip \
    psmisc \
    lsof \
    r-base \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g @angular/cli
RUN npm i -g @nestjs/cli

RUN R --slave -e 'install.packages("sets", repos = "http://cran.us.r-project.org"); \
                    install.packages("RJSONIO", repos = "http://cran.us.r-project.org"); \
                    install.packages("fpc", repos = "http://cran.us.r-project.org")'

WORKDIR /opt/app

EXPOSE 8081 8080
