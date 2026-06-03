import pandas as pd
import sys

def generate_test_csv(rows=100000, filename="test_data.csv"):
    """Generate test CSV file with numerical data"""
    categories = ['A', 'B', 'C'] * (rows // 3 + 1)
    df = pd.DataFrame({
        'amount': range(1, rows + 1),
        'value': [i * 2 for i in range(1, rows + 1)],
        'category': categories[:rows]
    })
    df.to_csv(filename, index=False)
    print(f"Generated {filename} with {rows} rows")

if __name__ == "__main__":
    rows = int(sys.argv[1]) if len(sys.argv) > 1 else 100000
    filename = sys.argv[2] if len(sys.argv) > 2 else "test_data.csv"
    generate_test_csv(rows, filename)
