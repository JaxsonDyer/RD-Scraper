import os
import time
import docker
from docker.errors import DockerException, NotFound

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
            print("⏳ Waiting 10 seconds for MySQL to initialize...")
            time.sleep(10)
            
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
            "MYSQL_USER": db_user,
            "MYSQL_PASSWORD": db_password,
        }
        
        try:
            print(f"⏳ Downloading/Running mysql:8.0 image... this might take a minute.")
            client.containers.run(
                "mysql:8.0",
                name=container_name,
                environment=env_vars,
                ports={'3306/tcp': 3306},
                detach=True
            )
            print("⏳ Waiting 15 seconds for new MySQL instance to initialize...")
            time.sleep(15)
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
    validate_docker_env(name)
