#!/bin/bash

# Pakistan Grocery Delivery Platform - Deployment Script
# This script helps you set up and run the entire system

set -e

echo "🛒 Pakistan Grocery Delivery Platform - Setup Script"
echo "======================================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version 18+ required. Current version: $(node -v)"
    exit 1
fi

print_success "Node.js $(node -v) detected"

# Check if PostgreSQL is installed
if ! command -v psql &> /dev/null; then
    echo "❌ PostgreSQL is not installed. Please install PostgreSQL 15+ first."
    exit 1
fi

print_success "PostgreSQL detected"

# Get directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo ""
echo "What would you like to do?"
echo "1) Full Setup (Database + Backend + All Frontends)"
echo "2) Setup Database Only"
echo "3) Setup Backend Only"
echo "4) Setup Admin Panel Only"
echo "5) Setup Website Only"
echo "6) Setup Customer App Only"
echo "7) Setup Rider App Only"
echo "8) Start All Services"
echo "9) Exit"
echo ""
read -p "Enter your choice (1-9): " choice

case $choice in
    1)
        echo ""
        print_status "Running Full Setup..."
        
        # Database Setup
        echo ""
        print_status "Setting up Database..."
        read -p "Enter PostgreSQL database name [grocery_db]: " dbname
        dbname=${dbname:-grocery_db}
        
        read -p "Enter PostgreSQL username [postgres]: " dbuser
        dbuser=${dbuser:-postgres}
        
        read -sp "Enter PostgreSQL password: " dbpass
        echo ""
        
        # Create database
        PGPASSWORD=$dbpass psql -U $dbuser -c "CREATE DATABASE $dbname;" 2>/dev/null || print_warning "Database may already exist"
        
        # Run schema
        PGPASSWORD=$dbpass psql -U $dbuser -d $dbname -f database/schema.sql
        print_success "Database setup complete!"
        
        # Backend Setup
        echo ""
        print_status "Setting up Backend..."
        cd backend
        
        # Create .env
        cat > .env << EOL
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=$dbname
DB_USER=$dbuser
DB_PASSWORD=$dbpass
JWT_SECRET=$(openssl rand -hex 32)
JWT_EXPIRES_IN=7d
NODE_ENV=development
EOL
        
        npm install
        print_success "Backend setup complete!"
        cd ..
        
        # Admin Panel Setup
        echo ""
        print_status "Setting up Admin Panel..."
        cd admin-panel
        npm install
        print_success "Admin Panel setup complete!"
        cd ..
        
        # Website Setup
        echo ""
        print_status "Setting up Website..."
        cd website
        npm install
        print_success "Website setup complete!"
        cd ..
        
        # Customer App Setup
        echo ""
        print_status "Setting up Customer App..."
        cd customer-app
        npm install
        print_success "Customer App setup complete!"
        cd ..
        
        # Rider App Setup
        echo ""
        print_status "Setting up Rider App..."
        cd rider-app
        npm install
        print_success "Rider App setup complete!"
        cd ..
        
        echo ""
        print_success "Full setup complete! 🎉"
        echo ""
        echo "Next steps:"
        echo "1. Start backend: cd backend && npm run dev"
        echo "2. Start admin panel: cd admin-panel && npm run dev"
        echo "3. Start website: cd website && npm run dev"
        echo "4. Start customer app: cd customer-app && npx expo start"
        echo "5. Start rider app: cd rider-app && npx expo start"
        ;;
        
    2)
        echo ""
        print_status "Setting up Database..."
        read -p "Enter PostgreSQL database name [grocery_db]: " dbname
        dbname=${dbname:-grocery_db}
        
        read -p "Enter PostgreSQL username [postgres]: " dbuser
        dbuser=${dbuser:-postgres}
        
        read -sp "Enter PostgreSQL password: " dbpass
        echo ""
        
        PGPASSWORD=$dbpass psql -U $dbuser -c "CREATE DATABASE $dbname;" 2>/dev/null || print_warning "Database may already exist"
        PGPASSWORD=$dbpass psql -U $dbuser -d $dbname -f database/schema.sql
        print_success "Database setup complete!"
        ;;
        
    3)
        echo ""
        print_status "Setting up Backend..."
        cd backend
        
        if [ ! -f .env ]; then
            print_warning ".env file not found. Creating from example..."
            cp .env.example .env
            print_warning "Please edit .env with your database credentials"
        fi
        
        npm install
        print_success "Backend setup complete!"
        print_status "Run: cd backend && npm run dev"
        ;;
        
    4)
        echo ""
        print_status "Setting up Admin Panel..."
        cd admin-panel
        npm install
        print_success "Admin Panel setup complete!"
        print_status "Run: cd admin-panel && npm run dev"
        ;;
        
    5)
        echo ""
        print_status "Setting up Website..."
        cd website
        npm install
        print_success "Website setup complete!"
        print_status "Run: cd website && npm run dev"
        ;;
        
    6)
        echo ""
        print_status "Setting up Customer App..."
        cd customer-app
        npm install
        print_success "Customer App setup complete!"
        print_status "Run: cd customer-app && npx expo start"
        ;;
        
    7)
        echo ""
        print_status "Setting up Rider App..."
        cd rider-app
        npm install
        print_success "Rider App setup complete!"
        print_status "Run: cd rider-app && npx expo start"
        ;;
        
    8)
        echo ""
        print_status "Starting all services..."
        
        # Check if tmux is installed
        if command -v tmux &> /dev/null; then
            tmux new-session -d -s grocery-backend 'cd backend && npm run dev'
            tmux new-session -d -s grocery-admin 'cd admin-panel && npm run dev'
            tmux new-session -d -s grocery-website 'cd website && npm run dev'
            
            print_success "All services started in tmux sessions!"
            echo ""
            echo "Tmux sessions:"
            echo "  grocery-backend - Backend API (http://localhost:3000)"
            echo "  grocery-admin   - Admin Panel (http://localhost:5173)"
            echo "  grocery-website - Website (http://localhost:3001)"
            echo ""
            echo "Attach to a session: tmux attach -t <session-name>"
            echo "List sessions: tmux ls"
        else
            print_warning "tmux not installed. Starting services in background..."
            cd backend && npm run dev &
            cd ../admin-panel && npm run dev &
            cd ../website && npm run dev &
            print_success "Services started in background!"
        fi
        ;;
        
    9)
        echo "Exiting..."
        exit 0
        ;;
        
    *)
        echo "Invalid choice. Exiting..."
        exit 1
        ;;
esac

echo ""
echo "Thank you for using Pakistan Grocery Delivery Platform! 🛒"