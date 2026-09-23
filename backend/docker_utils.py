import os
import time
import docker
from docker.errors import DockerException, NotFound

MYSQL_PORT = 3306
MYSQL_STARTUP_TIMEOUT_SECONDS = 60

def _wait_for_mysql(container, password: str) -> bool:
    """Wait until MySQL is accepting connections inside the container."""
    deadline = time.monotonic() + MYSQL_STARTUP_TIMEOUT_SECONDS
    while time.monotonic() < deadline:
        container.reload()
        if container.status == 'running':
            result = container.exec_run(
                ["mysqladmin", "ping", "--user=root", "--silent"],
                environment={"MYSQL_PWD": password},
            )
            if result.exit_code == 0:
                return True
        time.sleep(2)
    return False

def validate_docker_env(container_name: str) -> bool:
    """
    Validates that:
    1. The target Docker Daemon is currently running.
    2. The specified MySQL container is running.
       If it is stopped, it starts it.
       If it doesn't exist, it creates and starts it using .env credentials.
    
    Returns True if ready, False on fatal error.
    """
    try:
        client = docker.from_env()
        if not client.ping():
            print("❌ Docker daemon is not responding to ping.")
            return False
            
    except DockerException as e:
        print(f"❌ Could not connect to Docker daemon. Is Docker running?\nDetails: {e}")
        return False
        
    try:
        container = client.containers.get(container_name)
        if container.status != 'running':
            print(f"⚠️ MySQL Container '{container_name}' exists but is stopped. Starting it...")
            container.start()

        print("⏳ Waiting for MySQL to accept connections...")
        if not _wait_for_mysql(container, os.environ.get('DB_PASSWORD', 'root')):
            print(f"❌ MySQL Container '{container_name}' did not become ready in time.")
            return False

        print(f"✅ Docker checks passed. Container '{container_name}' is running.")
        return True
            
    except NotFound:
        print(f"⚠️ MySQL Container '{container_name}' was not found. Creating and starting it...")
        db_user = os.environ.get('DB_USER', 'root')
        db_password = os.environ.get('DB_PASSWORD', 'root')
        db_name = os.environ.get('DB_NAME', 'scraper_db')
        
        env_vars = {
            "MYSQL_ROOT_PASSWORD": db_password,
            "MYSQL_DATABASE": db_name,
        }
        if db_user != 'root':
            env_vars["MYSQL_USER"] = db_user
            env_vars["MYSQL_PASSWORD"] = db_password
        
        try:
            print(f"⏳ Downloading/Running mysql:8.0 image... this might take a minute.")
            client.containers.run(
                "mysql:8.0",
                name=container_name,
                environment=env_vars,
                ports={f'{MYSQL_PORT}/tcp': ('127.0.0.1', MYSQL_PORT)},
                detach=True
            )
            container = client.containers.get(container_name)
            print("⏳ Waiting for the new MySQL instance to initialize...")
            if not _wait_for_mysql(container, db_password):
                print(f"❌ MySQL Container '{container_name}' did not become ready in time.")
                return False
            print(f"✅ Created and started container '{container_name}'.")
            return True
        except Exception as e:
            print(f"❌ Failed to create container: {e}")
            return False
            
    except Exception as e:
        print(f"❌ An unexpected error occurred: {e}")
        return False

if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    name = os.getenv("MYSQL_CONTAINER_NAME", "my_mysql_db")
    raise SystemExit(0 if validate_docker_env(name) else 1)
