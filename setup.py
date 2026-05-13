#!/usr/bin/env python
from setuptools import find_packages, setup

setup(
    name="grants_api",
    version="0.1.0",
    packages=find_packages(),
    include_package_data=True,
    install_requires=[
        "fastapi==0.104.1",
        "uvicorn[standard]==0.27.0",
        "sqlalchemy==2.0.23",
        "asyncpg==0.29.0",
        "python-dotenv==1.0.0",
        "requests==2.31.0",
        "beautifulsoup4==4.12.2",
        "lxml==4.9.3",
        "pydantic==2.5.0",
    ],
    zip_safe=False,
)