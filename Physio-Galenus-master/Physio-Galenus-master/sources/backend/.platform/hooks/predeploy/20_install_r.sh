#!/bin/bash

echo "Installing R"

amazon-linux-extras install -y R4
R --slave -e 'install.packages("sets", repos = "http://cran.us.r-project.org"); install.packages("RJSONIO", repos = "http://cran.us.r-project.org"); install.packages("fpc", repos = "http://cran.us.r-project.org")'